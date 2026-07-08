-- ============================================================================
-- S-A · Enums del dominio
-- Fuente: docs/DOMAIN.md §2/§3 y docs/CONTRACTS.md.
-- ============================================================================

-- Rol de usuario (perfil). DOMAIN §3.1.
create type rol as enum ('admin', 'trabajador');

-- Estado de un evento. DOMAIN §3.5.
create type estado_evento as enum ('planificado', 'en_curso', 'cerrado', 'cancelado');

-- Estado de una línea de reserva. DOMAIN §3.6.
create type estado_reserva as enum ('activa', 'cumplida', 'cancelada');

-- Tipo de movimiento en el log inmutable. DOMAIN §3.7.
create type tipo_movimiento as enum ('entrada', 'salida_evento', 'devolucion', 'ajuste', 'baja');

-- Bucket operativo de stock. DOMAIN §1.
-- Nota: 'baja' NO es un bucket (las bajas salen del total y se cuentan en
-- producto.baja_acumulada); por eso no aparece aquí. Sí se usa como
-- movimiento.bucket_destino textual cuando una devolución termina en baja.
create type bucket as enum ('disponible', 'en_evento', 'en_reparacion');
