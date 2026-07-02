# POS Integral — Sistema para Restaurante de Shakes y Alimentos

Sistema POS integral para operación de cadena de shakes y alimentos rápidos. Centraliza ventas, inventarios, producción, delivery, lealtad de clientes, recursos humanos y análisis operativo.

## Apps

| App | Descripción | Puerto |
|-----|-------------|--------|
| `apps/kiosko` | Kiosko táctil de autocobro (React + Electron) | — |
| `apps/cocina-alimentos` | KDS — Pantalla de cocina: Alimentos | 3001 |
| `apps/cocina-bebidas` | KDS — Pantalla de cocina: Bebidas | 3002 |
| `apps/admin` | Panel de administración multisucursal | 3003 |

## Paquetes

| Paquete | Descripción |
|---------|-------------|
| `packages/ui` | Componentes React compartidos |
| `packages/supabase` | Cliente Supabase, tipos TypeScript completos, queries |
| `packages/config` | TypeScript y ESLint compartidos |

## Módulos del sistema

### Fase 1 — MVP
- [x] Scaffolding monorepo Turborepo
- [x] Esquema de base de datos multisucursal
- [x] Gestión de menú (admin)
- [ ] POS — Caja con cajero
- [ ] KDS mejorado (prioridad, tiempos)
- [ ] Inventario completo (almacén, lotes, transferencias)
- [ ] Roles y permisos granulares
- [ ] Reportes básicos
- [ ] Integración Delivery

### Fase 2 — Automatización y Fidelización
- [ ] Loyalty / Puntos
- [ ] Wallet / Monedero / Gift cards
- [ ] Promociones inteligentes
- [ ] Dashboard ejecutivo avanzado
- [ ] Pantalla cliente (customer display)

### Fase 3 — Escalamiento
- [ ] App móvil
- [ ] IA y recomendaciones
- [ ] Predicción de inventario
- [ ] Analítica avanzada

## Estructura de base de datos

### Núcleo
- `sucursales` — branches
- `cocinas` — kitchen stations (alimentos / bebidas)
- `categorias` — product categories
- `productos` — master product catalog
- `productos_sucursal` — per-branch product overrides

### Inventario
- `insumos` — ingredients/supplies
- `recetas` — product recipes
- `almacenes` — warehouses (central + per branch)
- `inventario_stock` — stock levels per warehouse
- `lotes` — lot/batch tracking with expiration dates
- `mermas` — waste/shrinkage
- `transferencias` + `transferencia_items` — inter-warehouse transfers
- `inventario_movimientos` — movement log

### Órdenes
- `ordenes` — orders (POS/kiosk/delivery)
- `orden_items` — order line items
- `orden_pagos` — payments (supports split payment)
- `ventas` — accounting records

### Delivery
- `plataformas_delivery` — Uber Eats, Didi Food, Rappi
- `ordenes_delivery` — external platform orders

### Loyalty
- `clientes` — customer profiles
- `puntos_movimientos` — points history
- `wallet_movimientos` — wallet transactions
- `gift_cards` — gift card management
- `promociones` — promotions and discounts

### RRHH
- `empleados` — staff with roles
- `turnos` — work shifts
- `asistencias` — clock in/out
- `cortes_caja` — cash register closing

### Sistema
- `usuarios` — auth users
- `bitacora` — audit log

## Comandos

```bash
npm install          # Instalar dependencias
npm run dev          # Todas las apps en paralelo
npm run build        # Build de producción
npm run type-check   # Verificar tipos
```

## Variables de entorno

Copiar `.env.example` a `.env` y completar las credenciales.

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Kiosko táctil | React + Electron |
| Cocinas / Admin | React + Vite |
| Base de datos | Supabase (PostgreSQL + Realtime + Auth) |
| Comunicación real-time | Supabase Realtime (WebSockets) |
| Pagos | Mercado Pago SDK |
| Facturación CFDI | Facturapi |
| Lenguaje | TypeScript |
| Monorepo | Turborepo + npm workspaces |
