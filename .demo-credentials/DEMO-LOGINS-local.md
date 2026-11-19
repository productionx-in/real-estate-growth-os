# REGrow DEMO / TEST logins — PRIVATE, STAGING ONLY

Generated 2026-11-19T11:06:12.433Z for the local stack. Sign in at (the staging app URL)/login.
Do not share outside the test team. Never publish on the REGrow website. These accounts exist only in this staging database.

Temporary password for every account: `12345678@`

| Email | Role | Organisation | Name |
|---|---|---|---|
| builder.admin@example.test | owner | Apex Developers Demo | Arjun Mehta (Demo) |
| builder.manager@example.test | manager | Apex Developers Demo | Kavya Iyer (Demo) |
| builder.sales@example.test | sales_exec | Apex Developers Demo | Rohan Desai (Demo) |
| partner.admin@example.test | owner | Prime Channel Partners Demo | Neha Kapoor (Demo) |
| partner.manager@example.test | manager | Prime Channel Partners Demo | Vikram Sethi (Demo) |
| partner.sales@example.test | sales_exec | Prime Channel Partners Demo | Pooja Nair (Demo) |
| agency.admin@example.test | owner | Growth Realty Agency Demo | Sameer Khan (Demo) |
| agency.manager@example.test | manager | Growth Realty Agency Demo | Ananya Rao (Demo) |
| agency.sales@example.test | sales_exec | Growth Realty Agency Demo | Karan Joshi (Demo) |
| superadmin@example.test | super_admin | REGrow internal (platform) | Platform Owner (Demo) |
| sales@regrow-demo.example.test | sales_rep | REGrow internal (platform) | Internal Sales Executive (Demo) |
| manager@regrow-demo.example.test | sales_manager | REGrow internal (platform) | Internal Sales Manager (Demo) |
| support@regrow-demo.example.test | support_agent | REGrow internal (platform) | Support Agent (Demo) |
| finance@regrow-demo.example.test | finance_admin | REGrow internal (platform) | Finance (Demo) |
| auditor@regrow-demo.example.test | auditor | REGrow internal (platform) | Auditor (Demo) |

## Authenticator secrets (internal staff only)

The REGrow console requires an authenticator code. Add each secret to an authenticator app (manual entry, TOTP, 6 digits, 30 s),
or scan the otpauth URI with a QR generator you trust offline. A reset creates new secrets.

- **superadmin@example.test** — secret `WDAFJL6JQZMCNZD4CA3U7KU2HCVLUVWZ`
  - `otpauth://totp/localhost:3000:superadmin@example.test?algorithm=SHA1&digits=6&issuer=localhost:3000&period=30&secret=WDAFJL6JQZMCNZD4CA3U7KU2HCVLUVWZ`
- **sales@regrow-demo.example.test** — secret `LBC5WNT2HSCRGCXWKF7EVUVOH4W6PGFH`
  - `otpauth://totp/localhost:3000:sales@regrow-demo.example.test?algorithm=SHA1&digits=6&issuer=localhost:3000&period=30&secret=LBC5WNT2HSCRGCXWKF7EVUVOH4W6PGFH`
- **manager@regrow-demo.example.test** — secret `J3JZOM23PJZ6GA5NCIMZJCPPHR2ALKMJ`
  - `otpauth://totp/localhost:3000:manager@regrow-demo.example.test?algorithm=SHA1&digits=6&issuer=localhost:3000&period=30&secret=J3JZOM23PJZ6GA5NCIMZJCPPHR2ALKMJ`
- **support@regrow-demo.example.test** — secret `QMWRJ4FEGF4PXSTJNT4ECUPTTYRCXKGQ`
  - `otpauth://totp/localhost:3000:support@regrow-demo.example.test?algorithm=SHA1&digits=6&issuer=localhost:3000&period=30&secret=QMWRJ4FEGF4PXSTJNT4ECUPTTYRCXKGQ`
- **finance@regrow-demo.example.test** — secret `P4SKLJRGR77YDWVGDFQNCBCVKSQ3UHXH`
  - `otpauth://totp/localhost:3000:finance@regrow-demo.example.test?algorithm=SHA1&digits=6&issuer=localhost:3000&period=30&secret=P4SKLJRGR77YDWVGDFQNCBCVKSQ3UHXH`
- **auditor@regrow-demo.example.test** — secret `VCHAPSZMWCQDROUEEFMU2NKHGCT2EAQX`
  - `otpauth://totp/localhost:3000:auditor@regrow-demo.example.test?algorithm=SHA1&digits=6&issuer=localhost:3000&period=30&secret=VCHAPSZMWCQDROUEEFMU2NKHGCT2EAQX`
