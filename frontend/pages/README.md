# Router boundary

This intentionally contains no route files. Next.js resolves this directory
before `src/pages`, allowing the SPARK-style `src/pages/<Feature>` directory to
remain ordinary feature components. The application's routes live exclusively
in `app`. Keep this boundary when copying the frontend: feature components
must never become public Pages Router endpoints.
