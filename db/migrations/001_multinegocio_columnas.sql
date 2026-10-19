BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.empleados
ADD COLUMN IF NOT EXISTS id_negocio INTEGER;

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS id_negocio INTEGER;

ALTER TABLE public.mascotas
ADD COLUMN IF NOT EXISTS id_negocio INTEGER;

ALTER TABLE public.servicios
ADD COLUMN IF NOT EXISTS id_negocio INTEGER;

ALTER TABLE public.productos
ADD COLUMN IF NOT EXISTS id_negocio INTEGER;

ALTER TABLE public.proveedores
ADD COLUMN IF NOT EXISTS id_negocio INTEGER;

ALTER TABLE public.movimientos_inventario
ADD COLUMN IF NOT EXISTS id_negocio INTEGER;

ALTER TABLE public.citas
ADD COLUMN IF NOT EXISTS id_negocio INTEGER;

ALTER TABLE public.ventas
ADD COLUMN IF NOT EXISTS id_negocio INTEGER;

ALTER TABLE public.reportes_financieros_historicos
ADD COLUMN IF NOT EXISTS id_negocio INTEGER;

COMMIT;