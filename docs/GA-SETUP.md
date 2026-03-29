# Google Analytics: MCP (Cursor) y dashboard

## Google Cloud

1. Crea o elige un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
2. Habilita estas APIs:
   - [Google Analytics Admin API](https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com)
   - [Google Analytics Data API](https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com)
3. Credenciales con alcance de solo lectura:
   - `https://www.googleapis.com/auth/analytics.readonly`
4. **Application Default Credentials (ADC)** (mismo flujo para MCP y este proyecto Next.js en local):
   - OAuth de usuario: `gcloud auth application-default login` con `--scopes` y `--client-id-file` según [ADC](https://cloud.google.com/docs/authentication/provide-credentials-adc).
   - O service account: JSON de clave + añadir la SA en GA con permisos sobre las cuentas/propiedades necesarias.

## MCP en Cursor (`analytics-mcp`)

Requisitos: Python 3.10+, [pipx](https://pipx.pypa.io/), paquete [analytics-mcp](https://github.com/googleanalytics/google-analytics-mcp).

En `~/.cursor/mcp.json` (o la ruta de MCP de tu instalación), añade:

```json
{
  "mcpServers": {
    "analytics-mcp": {
      "command": "pipx",
      "args": ["run", "analytics-mcp"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/ruta/absoluta/credentials.json",
        "GOOGLE_PROJECT_ID": "tu-project-id"
      }
    }
  }
}
```

Tras guardar, reinicia o recarga los servidores MCP en Cursor. Deberías ver herramientas como `get_account_summaries` y `run_report`.

## Dashboard Next.js (este repo)

Copia `.env.example` a `.env.local` y define:

- `GOOGLE_APPLICATION_CREDENTIALS`: ruta absoluta al JSON de credenciales (el mismo que uses para MCP, si aplica).
- `GOOGLE_CLOUD_PROJECT` (opcional): ID del proyecto GCP.

Arranca con `npm run dev` y abre la página principal; los datos se obtienen vía Admin API en el servidor (`/api/analytics/accounts`).

No subas nunca archivos de claves al repositorio.

## Neon PostgreSQL (datos guardados)

1. Crea un proyecto en [Neon](https://neon.tech/) y copia la connection string.
2. Añade `DATABASE_URL` en `.env.local` (mismo formato que te da Neon, con `sslmode=require`).
3. En el **SQL Editor** de Neon, ejecuta el contenido de [`db/schema.sql`](../db/schema.sql) para crear la tabla `ga_property_snapshot`.
4. En la app: **Recargar (Neon)** lee la tabla; **Sincronizar → Neon** llama a Google Analytics y reemplaza el snapshot en la base.

Si la contraseña de la URL se filtra, rota la contraseña en Neon y actualiza `.env.local`.

## Excluir tu tráfico (User-ID) y tráfico interno

- **Entre propiedades GA4** la API no puede saber si dos visitantes son la misma persona salvo que envíes un **User-ID** desde la web/app al configurar GA4. Si lo tienes, define en `.env.local` `GA4_EXCLUDED_USER_IDS` con valores separados por coma; los informes de esta app aplicarán un filtro `userId NOT IN (...)` en la Data API.
- Sin User-ID, lo habitual es marcar **tráfico interno** o IPs en **Administrador de Google Analytics** (filtros de datos / definiciones de tráfico interno), no solo en esta app.

## Resúmenes con IA (Together)

1. Crea una clave en [Together AI](https://www.together.ai/) y añade `TOGETHER_API_KEY` a `.env.local`.
2. Opcional: `TOGETHER_MODEL` (por defecto se usa un modelo Llama 3.3 instruct).
3. La home llama a `POST /api/insights` con el JSON de tráfico; la clave **nunca** sale al navegador.
4. **Misma consulta que Tráfico** (sin países en la home; el desglose por país y la tabla detallada están en la página Tráfico). Tras editar `.env.local`, **reinicia `npm run dev`** para cargar la clave.
