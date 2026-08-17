'use client'

import { useActionState, useState } from 'react'
import { Save } from 'lucide-react'
import { saveSettings } from '@/app/admin/_actions/settings'
import { IDLE, type ActionState } from '@/app/admin/_lib/action-state'
import type { RoomSettings } from '@/app/admin/_lib/view-types'
import { ActionMessage } from './ActionMessage'
import { SubmitButton } from './SubmitButton'
import { Card, Field, fieldClass, Note, SectionTitle } from './ui'

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
  onChange,
}: {
  name: string
  label: string
  hint: string
  defaultChecked: boolean
  onChange?: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 rounded-[10px] bg-[var(--surface-sunken)] px-4 py-3.5">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        onChange={(event) => onChange?.(event.target.checked)}
        className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--color-sahel)]"
      />
      <span className="min-w-0">
        <span className="block text-[0.9rem] text-[var(--text-primary)]">{label}</span>
        <span className="text-pretty mt-1 block text-[0.8rem] leading-relaxed text-[var(--text-muted)]">
          {hint}
        </span>
      </span>
    </label>
  )
}

/**
 * Room configuration. One form, one save — settings that contradict each other
 * (an NDA gate switched on with no NDA text) are refused by the action rather
 * than written and discovered later by a visitor.
 */
export function SettingsForm({ settings }: { settings: RoomSettings }) {
  const [state, action] = useActionState<ActionState, FormData>(saveSettings, IDLE)
  const [ndaOn, setNdaOn] = useState(settings.ndaEnabled)

  return (
    <form action={action} className="flex flex-col gap-5">
      <Card>
        <SectionTitle>The room</SectionTitle>

        <div className="flex flex-col gap-4">
          <Field
            label="Room title"
            htmlFor="room-title"
            hint="Shown at the top of the room and in the subject line of every invite email."
          >
            <input
              id="room-title"
              name="roomTitle"
              defaultValue={settings.roomTitle}
              required
              maxLength={120}
              className={fieldClass()}
            />
          </Field>

          <Field
            label="Welcome message"
            htmlFor="room-welcome"
            hint="The first thing a visitor reads. Say what is inside and how you would like it read."
          >
            <textarea
              id="room-welcome"
              name="welcomeMessage"
              rows={3}
              defaultValue={settings.welcomeMessage}
              maxLength={2000}
              className={fieldClass('resize-y')}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>Protection</SectionTitle>

        <div className="flex flex-col gap-3">
          <Toggle
            name="ndaEnabled"
            label="Require an NDA before the room opens"
            hint="A visitor types their name to accept. The signature is stored with the timestamp, the IP address and a hash of the exact text they saw, so the record still proves itself after the wording changes."
            defaultChecked={settings.ndaEnabled}
            onChange={setNdaOn}
          />

          <Toggle
            name="watermarkEnabled"
            label="Watermark documents with the reader’s identity"
            hint="Their email and the time are drawn over every page. A screenshot that leaves the room carries the name of whoever took it."
            defaultChecked={settings.watermarkEnabled}
          />

          <Toggle
            name="qaEnabled"
            label="Let readers ask questions inside the room"
            hint="Questions and document requests arrive here instead of scattering across email, and stay attached to the document that prompted them. You are emailed when one is asked."
            defaultChecked={settings.qaEnabled}
          />

          <Toggle
            name="showSealedCount"
            label="Tell readers when a section holds material they cannot see yet"
            hint="A narrowed link then reads “3 items are sealed at the confirmatory stage” at the foot of a section. Off by default — whether to advertise that is a commercial judgement."
            defaultChecked={settings.showSealedCount}
          />

          <Toggle
            name="defaultCanDownload"
            label="New invites may download by default"
            hint="Only the default for the invite form — every link can be changed afterwards, and a document’s own policy overrides it in both directions."
            defaultChecked={settings.defaultCanDownload}
          />
        </div>

        <div className="mt-5 grid gap-4">
          <Field
            label="NDA version"
            htmlFor="nda-version"
            hint="Written into every signature record. Change it whenever the wording below changes, so old signatures stay attributable to the text they actually agreed to."
          >
            <input
              id="nda-version"
              name="ndaVersion"
              defaultValue={settings.ndaVersion}
              required
              maxLength={40}
              className={fieldClass('max-w-[220px] font-mono text-[0.85rem]')}
            />
          </Field>

          <Field
            label="NDA text"
            htmlFor="nda-text"
            hint={
              ndaOn
                ? 'Shown in full before the room opens. Plain language reads better than borrowed legalese.'
                : 'The gate is off, so this is not shown to anyone. It is kept here for when you turn it back on.'
            }
          >
            <textarea
              id="nda-text"
              name="ndaText"
              rows={12}
              defaultValue={settings.ndaText}
              maxLength={20000}
              className={fieldClass('resize-y font-mono text-[0.8rem] leading-relaxed')}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>Alerts</SectionTitle>

        <Field
          label="Notification email"
          htmlFor="alert-email"
          hint="Where notable events are sent — a first open, a download, a link used from an unfamiliar device. Leave blank for none."
        >
          <input
            id="alert-email"
            name="alertEmail"
            type="email"
            defaultValue={settings.alertEmail}
            placeholder="you@company.com"
            className={fieldClass('max-w-[360px]')}
          />
        </Field>

        <Note className="mt-3">
          Delivery depends on Resend being configured. Without it nothing is emailed anywhere —
          including sign-in codes, which fall back to the server log.
        </Note>
      </Card>

      <div className="flex flex-col gap-3">
        <ActionMessage state={state} />
        <div>
          <SubmitButton pendingLabel="Saving…">
            <Save size={14} aria-hidden />
            Save settings
          </SubmitButton>
        </div>
      </div>
    </form>
  )
}
