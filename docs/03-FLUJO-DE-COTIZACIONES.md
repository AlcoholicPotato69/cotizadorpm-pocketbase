# Ciclo de Vida: Clientes, Cotizaciones y Liquidaciones

Esta es la travesía estandarizada operativa de un cliente, desde su creación en catálogo hasta el momento en el que se liquida con una "Constancia".

## 1. Creación del Expediente de Cliente

Todos los contratos requieren una entidad asociada. Un Operativo entra a "Clientes" y registra la persona o razón social.
**Restricción RBAC:** El perfil requiere de los permisos de `clients_manage` o al menos `clients_create` para poder guardar este registro en PocketBase.

## 2. Bloqueo Documental (Review Process)
El cliente para llegar a Cotizaciones debe estar en un estado verificable. Es un híbrido de validación humana:
- El asesor de ventas (o en portal público, el cliente) sube documentos: INE, Comprobante Domicilio, Acta Constitutiva.
- El estado pasa de `faltante` a `pendiente`.
- Solo un usuario Auditor (Permiso: `clients_verify`) podrá entrar a esa sección, revisar las imágenes/pdfs y marcarlas como `aprobado` u `omitido`.

## 3. Emisión de la Cotización

El perfil se dirige al `Catálogo` y selecciona las fechas.
El sistema cruza validaciones en la base de datos evaluando los arreglos de tiempos (start y end).
*   Si el espacio ya fue marcado en estado `aprobada` o `finalizada`, bloqueará al operativo del cruce de espacio y fecha y se mostrará `OCUPADO` visual y procedimentalmente.

## 4. Snapshots Documentales

Una vez generada la cotización, esta puede permanecer en estado `borrador`.
Pero, una vez confirmados los montos con el cliente final, el operativo ejecuta **Generar Snapshot** para escalar el estado a `aprobado`.

> La magia de los *Snapshots*: Este botón lo que hace es tomar el DOM en frontend o la estructura CSS de cotización, la renderiza a PDF con la librería html2canvas/jspdf, y guarda un respaldo INMUTABLE en el almacenamiento `documentos` (`Storage` en base local de PocketBase). A partir de aquí no se aceptan modificaciones por roles que no sean `admin`.

## 5. Formalización: El Contrato y La Facturación

A un evento aprobado, se le pueden emitir Ordenes de Compra y luego cruzar hacia la pantalla de Contratos.
1. Se firma un Contrato, cargando la plantilla predeterminada y rellenando sus tokens (DOC_TITLE, DOC_FOLIO, etc.).
2. El cliente hace abonos paulatinos. El cajero sube `Recibos`. El balance desciende.
3. Al caer a cero (`balance <= 0.01`), se le autoriza generar el comprobante final que sella y entierra operativamente el evento en estado: **PAGADO** ("Constancia de Liquidación"). El evento pasa silenciosamente al estado final en DB y se sella su edición final.
