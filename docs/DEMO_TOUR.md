# Demo Tour Routes Map

Rutas detectadas (reales) bajo `webapp-excel/app/(app)/[empresa]`:

- `/[empresa]`
- `/[empresa]/maestros`
- `/[empresa]/maestros/clientes`
- `/[empresa]/maestros/articulos`
- `/[empresa]/maestros/temporadas`
- `/[empresa]/maestros/subfamilias`
- `/[empresa]/fichas`
- `/[empresa]/rrhh`
- `/[empresa]/rrhh/control-horario`
- `/[empresa]/rrhh/vacaciones`
- `/[empresa]/rrhh/calendario`
- `/[empresa]/admin`
- `/[empresa]/legacy`

## 6 pasos seleccionados para el tour

1. **Panel de empresa**
   - `/${empresa}`
2. **Maestros**
   - `/${empresa}/maestros`
3. **Clientes (maestros)**
   - `/${empresa}/maestros/clientes`
4. **Fichas**
   - `/${empresa}/fichas`
5. **RRHH · Control horario**
   - `/${empresa}/rrhh/control-horario`
6. **Legacy**
   - `/${empresa}/legacy`

Todos los enlaces del tour están construidos desde el parámetro dinámico `[empresa]` y apuntan a páginas existentes (`page.tsx`).
