/**
 * DOC: client\js\hub-config.js
 * Proposito: Configuracion global de entorno, tenant, branding y endpoints.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

const __hubPath = String(window.location.pathname || '').toLowerCase();
const __hubNested = /\/(cotizador|cotizadorcp|public|system)\//.test(__hubPath);
const __hubAssetsBase = __hubNested ? '../../assets' : '../assets';
const __hubPublicBase = __hubNested ? '../public' : './public';

window.HUB_CONFIG = {
  // Supabase local (por defecto)
  supabaseUrl: 'http://127.0.0.1:8090'
  , pocketbaseUrl: 'http://127.0.0.1:8090',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',

  // Esquema SQL del cotizador
  finanzasSchema: 'finanzas',

  // Modo local (sin roles, sin notificaciones, sin cotizador externo)
  localMode: true,

  // Logo del sistema (opcional). Si usas Storage local, sube el archivo a:
  // Bucket: espacios  |  Ruta: logo.png  |  Público: true
  // Si prefieres un archivo local, pon una ruta relativa (ej: './assets/logo.png').
  companyLogoUrl: `${__hubAssetsBase}/logo.png`,

  // Logo Casa de Piedra (Storage local)
  companyLogoUrlCP: `${__hubAssetsBase}/logocp.png`,

  // Membretes PDF por tenant (carta)
  pmPdfLetterheadUrl: `${__hubPublicBase}/assets/img/pm-letterhead-default.png`,
  cpPdfLetterheadUrl: `${__hubPublicBase}/assets/img/cp-letterhead-default.png`,

  // Feed ICS opcional para sincronizar el calendario unificado de Casa de Piedra
  // Flujo simple recomendado en autohosteado:
  // 1) Configura supabaseUrl con tu IP/dominio de produccion.
  // 2) Deja cpCalendarIcsUrl vacio.
  // 3) El front usa automaticamente: {supabaseUrl}/functions/v1/cp-calendar-ics
  // Si quieres proteger el feed, agrega token con cpCalendarIcsToken.
  // cpCalendarIcsUrl: 'https://IP-O-DOMINIO/functions/v1/cp-calendar-ics',
  cpCalendarIcsUrl: 'http://127.0.0.1:8090/api/cotizador/cp-calendar-ics',
  cpCalendarIcsToken: 'b1a38ff792a127d89980285a05cc8525bdcc2195227ca8a4b7b51a56ae312aa5',

  // Módulos visibles en el menú (index.html) cuando localMode=true
    localModules: [
    { name: 'Cotizador - Plaza Mayor',    description: 'Acceso al cotizador de Plaza Mayor.',    icon: 'fa-store', url_path: 'cotizador/catalog.html',   color: 'red',  tenant: 'plaza_mayor' },
    { name: 'Cotizador - Casa de Piedra', description: 'Acceso al cotizador de Casa de Piedra.', icon: 'fa-gem',   url_path: 'cotizadorcp/catalog.html', color: 'cp', tenant: 'casa_de_piedra' }
  ]
};
