# ============= STREAMLIT APP =============

st.set_page_config(page_title="Resumen pedidos EDIWIN", layout="wide")

st.title("📦 Resumen de pedidos desde PDF EDIWIN")

cliente = st.selectbox("Cliente", ["Eurofiel", "El Corte Inglés"])

st.write(
    "Sube un PDF de **Eurofiel** o **El Corte Inglés** y te saco "
    "las líneas clave listas para Excel."
)

label = (
    "📁 Sube tu PDF de Eurofiel"
    if cliente == "Eurofiel"
    else "📁 Sube tu PDF de El Corte Inglés"
)
uploaded_pdf = st.file_uploader(label, type=["pdf"])

if uploaded_pdf is not None:
    try:
        if cliente == "Eurofiel":
            df = parse_pdf_eurofiel_bytes(uploaded_pdf.getvalue())
        else:
            df = parse_pdf_eci_bytes(uploaded_pdf.getvalue())

        if df.empty:
            st.warning("No se han detectado pedidos en el PDF. Revisa el formato.")
        else:
            st.subheader("📊 Vista previa de pedidos detectados")

            # Aseguramos TOTAL_UNIDADES numérico
            if "TOTAL_UNIDADES" in df.columns:
                df["TOTAL_UNIDADES"] = pd.to_numeric(
                    df["TOTAL_UNIDADES"], errors="coerce"
                ).fillna(0)

            # ===== Limpiamos tallas que están todo a 0 =====
            active_sizes = get_active_sizes(df)
            zero_size_cols = [
                t for t in TALLAS if t in df.columns and t not in active_sizes
            ]
            df_display = df.drop(columns=zero_size_cols)

            # Estilos por MODELO usando solo tallas activas
            styled_df = style_by_model(df_display)
            st.dataframe(styled_df, use_container_width=True)

            # ====== RESÚMENES Y EXPORT ======
            if cliente == "Eurofiel":
                st.subheader("📦 Resumen por MODELO")

                resumen = (
                    df.groupby("MODELO", dropna=False)
                    .agg(
                        PEDIDOS=("PEDIDO", "nunique"),
                        UNIDADES_TOTALES=("TOTAL_UNIDADES", "sum"),
                    )
                    .reset_index()
                    .sort_values("PEDIDOS", ascending=False)
                )

                st.dataframe(resumen, use_container_width=True)

                # --- versión para Excel con fila TOTAL ---
                resumen_xlsx = resumen.copy()
                total_row = {
                    "MODELO": "TOTAL",
                    "PEDIDOS": resumen_xlsx["PEDIDOS"].sum(),
                    "UNIDADES_TOTALES": resumen_xlsx["UNIDADES_TOTALES"].sum(),
                }
                resumen_xlsx = pd.concat(
                    [resumen_xlsx, pd.DataFrame([total_row])],
                    ignore_index=True,
                )

                # ---- Exportar Excel Eurofiel ----
                excel_buffer = BytesIO()
                with pd.ExcelWriter(excel_buffer, engine="openpyxl") as writer:
                    # Ojo: styled_df ya está hecho sobre df_display
                    styled_df.to_excel(writer, sheet_name="Pedidos", index=False)
                    resumen_xlsx.to_excel(
                        writer, sheet_name="Resumen por modelo", index=False
                    )

                    wb = writer.book
                    style_workbook_with_borders_and_headers(wb)

                st.download_button(
                    label="⬇️ Descargar Excel",
                    data=excel_buffer.getvalue(),
                    file_name="eurofiel_resumen_pedidos.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )

                # CSV simple (también sin tallas 0)
                csv_bytes = df_display.to_csv(index=False).encode("utf-8")
                st.download_button(
                    label="⬇️ Descargar CSV",
                    data=csv_bytes,
                    file_name="eurofiel_resumen_pedidos.csv",
                    mime="text/csv",
                )

                # ---- Crear carpetas y PDFs por modelo en Eurofiel ----
                if st.button("📂 Crear carpetas y PDFs por modelo en Eurofiel"):
                    try:
                        EUROFIEL_BASE_DIR = r"./data/ediwin/out/eurofiel"
                        create_eurofiel_folders_and_pdfs(
                            df, uploaded_pdf.getvalue(), EUROFIEL_BASE_DIR
                        )
                        st.success(f"Carpetas y PDFs creados en '{EUROFIEL_BASE_DIR}'.")
                    except Exception as e:
                        st.error(f"Error creando carpetas/PDFs: {e}")

                st.markdown("### TXT EDIWIN → repartir por modelo (EUROFIEL)")

                edi_files = st.file_uploader(
                    "Sube los TXT de EDIWIN (CABPED, LINPED, LOCPED, OBSPED, OBSLPED)",
                    type=["txt", "TXT"],
                    accept_multiple_files=True,
                    key="ediwin_txt_eurofiel",
                )

                # ✅ Opción para recortar MODELO (cod_prov LINPED) a 20 caracteres
                recortar_modelo = st.checkbox(
                    "Recortar campo MODELO de LINPED a 20 caracteres para Sage",
                    value=True,
                    help="Si lo activas, el programa acorta el MODELO (cod_prov) en LINPED para que Sage no lo rechace.",
                )

                if edi_files:
                    cab_file = lin_file = loc_file = obs_file = obsl_file = None

                    for f in edi_files:
                        name_upper = f.name.upper()
                        if "LINPED" in name_upper:
                            lin_file = f
                        elif "CABPED" in name_upper:
                            cab_file = f
                        elif "LOCPED" in name_upper:
                            loc_file = f
                        elif "OBSPED" in name_upper:
                            obs_file = f
                        elif "OBSLPED" in name_upper:
                            obsl_file = f

                    if st.button(
                        "📂 Repartir TXT EDIWIN por modelo en carpetas EUROFIEL"
                    ):
                        if lin_file is None:
                            st.error(
                                "Falta el fichero LINPED_*.TXT, es obligatorio para repartir por modelo."
                            )
                        else:
                            try:
                                max_len = 20 if recortar_modelo else None

                                model_changes = (
                                    split_ediwin_txt_files_per_model_eurofiel(
                                        base_dir=EUROFIEL_BASE_DIR,
                                        df=df,
                                        linped_bytes=lin_file.getvalue(),
                                        linped_name=lin_file.name,
                                        cabped_bytes=(
                                            cab_file.getvalue() if cab_file else None
                                        ),
                                        cabped_name=cab_file.name if cab_file else None,
                                        locped_bytes=(
                                            loc_file.getvalue() if loc_file else None
                                        ),
                                        locped_name=loc_file.name if loc_file else None,
                                        obsped_bytes=(
                                            obs_file.getvalue() if obs_file else None
                                        ),
                                        obsped_name=obs_file.name if obs_file else None,
                                        obslped_bytes=(
                                            obsl_file.getvalue() if obsl_file else None
                                        ),
                                        obslped_name=(
                                            obsl_file.name if obsl_file else None
                                        ),
                                        max_model_length=max_len,  # 👈 importante
                                    )
                                )

                                st.success(
                                    "TXT repartidos por modelo y copiados en sus carpetas EUROFIEL."
                                )

                                # 👀 Visualización de los modelos recortados para SAGE
                                if max_len is not None:
                                    if model_changes:
                                        st.markdown(
                                            "#### Modelos ajustados para SAGE (nombre corto)"
                                        )

                                        df_models = pd.DataFrame(
                                            [
                                                {"MODELO_ORIGINAL": k, "MODELO_SAGE": v}
                                                for k, v in sorted(
                                                    model_changes.items()
                                                )
                                            ]
                                        )
                                        st.dataframe(
                                            df_models, use_container_width=True
                                        )
                                    else:
                                        st.info(
                                            "No se ha recortado ningún modelo: todos caben en "
                                            f"{max_len} caracteres."
                                        )

                            except Exception as e:
                                st.error(f"Error al repartir TXT: {e}")

            else:  # El Corte Inglés
                st.subheader("📦 Resumen por MODELO + COLOR")

                resumen_mc = (
                    df.groupby(["MODELO", "COLOR"], dropna=False)
                    .agg(
                        PEDIDOS=("N_PEDIDO", "nunique"),
                        UNIDADES_TOTALES=("TOTAL_UNIDADES", "sum"),
                    )
                    .reset_index()
                    .sort_values("PEDIDOS", ascending=False)
                )

                st.dataframe(resumen_mc, use_container_width=True)

                st.subheader("🧩 Resumen por MODELO (todas las sucursales/colores)")

                resumen_m = (
                    df.groupby("MODELO", dropna=False)
                    .agg(
                        PEDIDOS=("N_PEDIDO", "nunique"),
                        UNIDADES_TOTALES=("TOTAL_UNIDADES", "sum"),
                    )
                    .reset_index()
                    .sort_values("PEDIDOS", ascending=False)
                )

                st.dataframe(resumen_m, use_container_width=True)

                # --- versiones para Excel con fila TOTAL ---
                resumen_mc_xlsx = resumen_mc.copy()
                total_mc = {
                    "MODELO": "TOTAL",
                    "COLOR": "",
                    "PEDIDOS": resumen_mc_xlsx["PEDIDOS"].sum(),
                    "UNIDADES_TOTALES": resumen_mc_xlsx["UNIDADES_TOTALES"].sum(),
                }
                resumen_mc_xlsx = pd.concat(
                    [resumen_mc_xlsx, pd.DataFrame([total_mc])],
                    ignore_index=True,
                )

                resumen_m_xlsx = resumen_m.copy()
                total_m = {
                    "MODELO": "TOTAL",
                    "PEDIDOS": resumen_m_xlsx["PEDIDOS"].sum(),
                    "UNIDADES_TOTALES": resumen_m_xlsx["UNIDADES_TOTALES"].sum(),
                }
                resumen_m_xlsx = pd.concat(
                    [resumen_m_xlsx, pd.DataFrame([total_m])],
                    ignore_index=True,
                )

                # ---- Exportar Excel ECI ----
                excel_buffer = BytesIO()
                with pd.ExcelWriter(excel_buffer, engine="openpyxl") as writer:
                    styled_df.to_excel(writer, sheet_name="Pedidos", index=False)
                    resumen_mc_xlsx.to_excel(
                        writer, sheet_name="Resumen modelo+color", index=False
                    )
                    resumen_m_xlsx.to_excel(
                        writer, sheet_name="Resumen modelo", index=False
                    )

                    wb = writer.book
                    style_workbook_with_borders_and_headers(wb)
                st.download_button(
                    label="⬇️ Descargar Excel",
                    data=excel_buffer.getvalue(),
                    file_name="eci_resumen_pedidos.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )

                # CSV simple
                csv_bytes = df_display.to_csv(index=False).encode("utf-8")
                st.download_button(
                    label="⬇️ Descargar CSV",
                    data=csv_bytes,
                    file_name="eci_resumen_pedidos.csv",
                    mime="text/csv",
                )

                # ---- Crear carpetas y PDFs por modelo en ECI ----
                if st.button("📂 Crear carpetas y PDFs por modelo en ECI"):
                    try:
                        ECI_BASE_DIR = r"./data/ediwin/out/eci"
                        create_eci_folders_and_pdfs(
                            df, uploaded_pdf.getvalue(), ECI_BASE_DIR
                        )
                        st.success(f"Carpetas y PDFs creados en '{ECI_BASE_DIR}'.")
                    except Exception as e:
                        st.error(f"Error creando carpetas/PDFs: {e}")

                st.markdown("### TXT EDIWIN → repartir por modelo")

                edi_files = st.file_uploader(
                    "Sube los TXT de EDIWIN (CABPED, LINPED, LOCPED, OBSPED, OBSLPED)",
                    type=["txt", "TXT"],
                    accept_multiple_files=True,
                )

                if edi_files:
                    # Clasificamos por nombre
                    cab_file = lin_file = loc_file = obs_file = obsl_file = None

                    for f in edi_files:
                        name_upper = f.name.upper()
                        if "LINPED" in name_upper:
                            lin_file = f
                        elif "CABPED" in name_upper:
                            cab_file = f
                        elif "LOCPED" in name_upper:
                            loc_file = f
                        elif "OBSLPED" in name_upper:
                            obsl_file = f
                        elif "OBSPED" in name_upper:
                            obs_file = f

                    if st.button("📂 Repartir TXT EDIWIN por modelo en carpetas ECI"):
                        if lin_file is None:
                            st.error(
                                "Falta el fichero LINPED_*.TXT, es obligatorio para repartir por modelo."
                            )
                        else:
                            try:
                                ECI_BASE_DIR = r"./data/ediwin/out/eci"

                                split_ediwin_txt_files_per_model(
                                    base_dir=ECI_BASE_DIR,
                                    linped_bytes=lin_file.getvalue(),
                                    linped_name=lin_file.name,
                                    cabped_bytes=(
                                        cab_file.getvalue() if cab_file else None
                                    ),
                                    cabped_name=cab_file.name if cab_file else None,
                                    locped_bytes=(
                                        loc_file.getvalue() if loc_file else None
                                    ),
                                    locped_name=loc_file.name if loc_file else None,
                                    obsped_bytes=(
                                        obs_file.getvalue() if obs_file else None
                                    ),
                                    obsped_name=obs_file.name if obs_file else None,
                                    obslped_bytes=(
                                        obsl_file.getvalue() if obsl_file else None
                                    ),
                                    obslped_name=obsl_file.name if obsl_file else None,
                                )

                                st.success(
                                    "TXT repartidos por modelo y copiados en sus carpetas ECI."
                                )
                            except Exception as e:
                                st.error(f"Error al repartir TXT: {e}")

    except Exception as e:
        st.error(f"❌ Error procesando el PDF: {e}")
else:
    st.info("Sube un PDF para empezar.")


# ===== FOOTER =====
st.markdown(
    """
<hr style="margin-top: 60px;">

<div style="text-align:center; font-size:14px; color:#777;">
    Creado y desarrollado con mucho amor ❤️ por<br>
    <strong style="font-size:16px;">Equipo Demo</strong><br>
    <span style="font-size:12px;">@elvasco.x</span>
</div>
""",
    unsafe_allow_html=True,
)
