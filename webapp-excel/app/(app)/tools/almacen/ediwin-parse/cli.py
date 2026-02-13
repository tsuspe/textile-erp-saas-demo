#!/usr/bin/env python3
# app/(app)/tools/almacen/ediwin-parse/cli.py

import argparse
import json
import sys
from pathlib import Path

import pandas as pd
from core import (
    TALLAS,
    create_eci_folders_and_pdfs_local,
    create_eurofiel_folders_and_pdfs_local,
    export_outputs_zip_full,
    get_active_sizes,
    parse_pdf_eci_bytes,
    parse_pdf_eurofiel_bytes,
    split_ediwin_txt_files_per_model,
    split_ediwin_txt_files_per_model_eurofiel,
)


def _read_optional_file(path_str: str | None) -> tuple[bytes | None, str | None]:
    if not path_str:
        return None, None
    p = Path(path_str)
    if not p.exists():
        return None, None
    return p.read_bytes(), p.name


def _parse_df(tipo: str, pdf_bytes: bytes) -> pd.DataFrame:
    tipo = tipo.upper()
    if tipo == "EUROFIEL":
        return parse_pdf_eurofiel_bytes(pdf_bytes)
    if tipo == "ECI":
        return parse_pdf_eci_bytes(pdf_bytes)
    raise ValueError("tipo debe ser EUROFIEL o ECI")


def _df_display(df: pd.DataFrame) -> pd.DataFrame:
    # replica el Streamlit: ocultar tallas a 0
    active_sizes = get_active_sizes(df)
    zero_size_cols = [t for t in TALLAS if t in df.columns and t not in active_sizes]
    return df.drop(columns=zero_size_cols, errors="ignore")


def cmd_preview(args):
    pdf_bytes = Path(args.input).read_bytes()
    df = _parse_df(args.tipo, pdf_bytes)
    if df.empty:
        print(json.dumps({"ok": False, "error": "EMPTY_DF"}))
        return 2

    dfp = _df_display(df)
    # --- FIX: asegurar que TOTAL_UNIDADES es numérico para que el resumen sume bien ---
    if "TOTAL_UNIDADES" in dfp.columns:
        dfp["TOTAL_UNIDADES"] = pd.to_numeric(
            dfp["TOTAL_UNIDADES"], errors="coerce"
        ).fillna(0)

    # resumen por modelo (similar a streamlit; si ECI, al menos por MODELO)
    if "PEDIDO" in dfp.columns:
        pedido_col = "PEDIDO"
    elif "N_PEDIDO" in dfp.columns:
        pedido_col = "N_PEDIDO"
    else:
        pedido_col = None

    if pedido_col:
        resumen = (
            dfp.groupby("MODELO", dropna=False)
            .agg(
                PEDIDOS=(pedido_col, "nunique"),
                UNIDADES_TOTALES=("TOTAL_UNIDADES", "sum"),
            )
            .reset_index()
            .sort_values("PEDIDOS", ascending=False)
        )
    else:
        resumen = pd.DataFrame([])

    # filas para preview (capado)
    limit = int(args.limit)
    rows = dfp.head(limit).to_dict(orient="records")
    cols = list(dfp.columns)

    print(
        json.dumps(
            {
                "ok": True,
                "columns": cols,
                "rows": rows,
                "resumen": resumen.to_dict(orient="records"),
            }
        )
    )
    return 0


def cmd_export(args):
    """
    Exporta CSV o XLSX (solo datos + estilos) a un path.
    La generación de estilos reales (colores por modelo) se hace en core.py.
    Aquí delegamos al zip full pero sin folders/txt y extraemos el archivo.
    """
    tipo = args.tipo.upper()
    pdf_bytes = Path(args.input).read_bytes()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Generamos zip temporal y extraemos solo el archivo pedido.
    tmp_zip = out_path.parent / (out_path.stem + ".__tmp__.zip")

    export_outputs_zip_full(
        tipo=tipo,
        pdf_bytes=pdf_bytes,
        outzip_path=str(tmp_zip),
        include_model_folders=False,
        recortar_modelo_sage=args.recortar_modelo_sage,
        sage_max_len=int(args.sage_model_maxlen),
    )

    # El zip contiene: <tipo>_resumen_pedidos.csv y .xlsx
    wanted = None
    if args.format == "csv":
        wanted = f"{tipo.lower()}_resumen_pedidos.csv"
    else:
        wanted = f"{tipo.lower()}_resumen_pedidos.xlsx"

    import zipfile

    with zipfile.ZipFile(tmp_zip, "r") as z:
        with z.open(wanted) as f:
            out_path.write_bytes(f.read())

    try:
        tmp_zip.unlink()
    except Exception:
        pass

    print(json.dumps({"ok": True, "out": str(out_path)}))
    return 0


def cmd_folders(args):
    tipo = args.tipo.upper()
    pdf_bytes = Path(args.input).read_bytes()
    base_dir = args.base_dir

    df = _parse_df(tipo, pdf_bytes)
    if df.empty:
        print(json.dumps({"ok": False, "error": "EMPTY_DF"}))
        return 2

    if tipo == "EUROFIEL":
        create_eurofiel_folders_and_pdfs_local(df, pdf_bytes, base_dir)
    else:
        create_eci_folders_and_pdfs_local(df, pdf_bytes, base_dir)

    print(json.dumps({"ok": True, "base_dir": base_dir}))
    return 0


def cmd_split_txt(args):
    tipo = args.tipo.upper()

    # Leer LINPED (obligatorio)
    lin_bytes, lin_name = _read_optional_file(args.linped)
    if not lin_bytes:
        print(json.dumps({"ok": False, "error": "LINPED_REQUIRED"}))
        return 2

    # Opcionales
    cab_bytes, cab_name = _read_optional_file(args.cabped)
    loc_bytes, loc_name = _read_optional_file(args.locped)
    obs_bytes, obs_name = _read_optional_file(args.obsped)
    obsl_bytes, obsl_name = _read_optional_file(args.obslped)

    # Sage (solo Eurofiel)
    recortar = args.recortar_modelo_sage
    max_len = int(args.sage_model_maxlen)
    effective_max_len = max_len if recortar else None  # None = no recortar

    if tipo == "EUROFIEL":
        # EUROFIEL: necesitamos df para mapear MODELO+PATRON
        pdf_bytes = Path(args.input).read_bytes()
        df = _parse_df(tipo, pdf_bytes)
        if df.empty:
            print(json.dumps({"ok": False, "error": "EMPTY_DF"}))
            return 2

        model_changes = split_ediwin_txt_files_per_model_eurofiel(
            base_dir=args.base_dir,
            df=df,
            linped_bytes=lin_bytes,
            linped_name=lin_name,
            cabped_bytes=cab_bytes,
            cabped_name=cab_name,
            locped_bytes=loc_bytes,
            locped_name=loc_name,
            obsped_bytes=obs_bytes,
            obsped_name=obs_name,
            obslped_bytes=obsl_bytes,
            obslped_name=obsl_name,
            max_model_length=effective_max_len,
        )

        print(
            json.dumps(
                {
                    "ok": True,
                    "base_dir": args.base_dir,
                    "model_changes_count": len(model_changes),
                }
            )
        )
        return 0

    if tipo == "ECI":
        # ECI: se reparte por MODELO leyendo LINPED (no requiere df)
        split_ediwin_txt_files_per_model(
            base_dir=args.base_dir,
            linped_bytes=lin_bytes,
            linped_name=lin_name,
            cabped_bytes=cab_bytes,
            cabped_name=cab_name,
            locped_bytes=loc_bytes,
            locped_name=loc_name,
            obsped_bytes=obs_bytes,
            obsped_name=obs_name,
            obslped_bytes=obsl_bytes,
            obslped_name=obsl_name,
        )

        print(
            json.dumps(
                {
                    "ok": True,
                    "base_dir": args.base_dir,
                    "model_changes_count": 0,
                }
            )
        )
        return 0

    print(json.dumps({"ok": False, "error": "BAD_TIPO"}))
    return 2


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--op", required=True, choices=["preview", "export", "folders", "split-txt"]
    )
    parser.add_argument("--tipo", required=True, choices=["EUROFIEL", "ECI"])
    parser.add_argument("--input", required=True)
    parser.add_argument("--limit", default="200")

    # export
    parser.add_argument("--format", choices=["csv", "xlsx"])
    parser.add_argument("--out")

    # folders / split-txt
    parser.add_argument("--base-dir")

    # txt
    parser.add_argument("--cabped")
    parser.add_argument("--linped")
    parser.add_argument("--locped")
    parser.add_argument("--obsped")
    parser.add_argument("--obslped")

    # sage
    parser.add_argument("--recortar-modelo-sage", action="store_true")
    parser.add_argument(
        "--no-recortar-modelo-sage", dest="recortar_modelo_sage", action="store_false"
    )
    parser.set_defaults(recortar_modelo_sage=True)
    parser.add_argument("--sage-model-maxlen", dest="sage_model_maxlen", default="20")

    args = parser.parse_args()

    try:
        if args.op == "preview":
            return cmd_preview(args)
        if args.op == "export":
            if not args.format or not args.out:
                print(json.dumps({"ok": False, "error": "MISSING_EXPORT_ARGS"}))
                return 2
            return cmd_export(args)
        if args.op == "folders":
            if not args.base_dir:
                print(json.dumps({"ok": False, "error": "MISSING_BASE_DIR"}))
                return 2
            return cmd_folders(args)
        if args.op == "split-txt":
            if not args.base_dir:
                print(json.dumps({"ok": False, "error": "MISSING_BASE_DIR"}))
                return 2
            return cmd_split_txt(args)

        print(json.dumps({"ok": False, "error": "UNKNOWN_OP"}))
        return 2

    except Exception as e:
        print(json.dumps({"ok": False, "error": "CLI_FAILED", "detail": str(e)}))
        return 2


if __name__ == "__main__":
    sys.exit(main())
