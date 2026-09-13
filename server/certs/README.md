# Supabase database certificate

`supabase-prod-ca-2021.crt` is the public root certificate linked by the Irish
Rummy project's Database Settings → SSL configuration → Download certificate.
It contains no private key or authentication secret.

Source: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Retrieved September 12, 2026. Subject/issuer: Supabase Root 2021 CA. Valid from
April 28, 2021 through April 26, 2031. A live read-only connection through the
project's Session pooler succeeded with this CA and certificate verification
enabled. Set `IRISH_RUMMY_DATABASE_CA_FILE` to this file when using that chain;
replace it from the official project dashboard if Supabase rotates its CA.
