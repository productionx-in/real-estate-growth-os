// app/staff/page.tsx — the short address RE staff type to sign in (re.productionx.in/staff). Unlisted: never linked
// from the public site. It only opens the staff sign-in; access is still decided on the server (platform role + an
// authenticator code).
import { redirect } from 'next/navigation'

export default function StaffShortcut() {
  redirect('/login?for=staff')
}
