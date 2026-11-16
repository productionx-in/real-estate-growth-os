// lib/notifications/register.ts
// Registers every external delivery channel with the notification dispatcher. Imported by the job worker.
import { registerChannelAdapter } from './channels'
import { pushAdapter } from './push'

registerChannelAdapter(pushAdapter)
