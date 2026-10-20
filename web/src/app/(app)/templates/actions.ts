'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { canManageRoles, requireMe } from '@/lib/auth'
import { db } from '@/lib/supabase/server'
import { RoleSpec } from '@/lib/templates/types'
import { getTemplate, audit } from '@/lib/data/roles'
import { blankSpec } from '@/lib/templates/blank'

type Res = { error?: string; ok?: string }

export async function createTemplateAction(_: Res, form: FormData): Promise<Res> {
  const me = await requireMe()
  if (!canManageRoles(me)) return { error: 'Only HR can create templates.' }
  const name = String(form.get('name') ?? '').trim()
  const family = String(form.get('family') ?? '').trim()
  const from = String(form.get('from') ?? '')
  if (!name) return { error: 'Give the template a name, e.g. “Design — Product Designer”.' }
  const source = from ? await getTemplate(from) : null
  const spec = source ? structuredClone(source.spec) : blankSpec(name)
  const { data, error } = await db()
    .from('templates')
    .insert({ name, family: family || source?.family || 'General', description: source ? `Based on ${source.name}` : '', spec, change_notes: [], created_by: me.id })
    .select('id')
    .single()
  if (error) return { error: error.message }
  await audit(null, me.id, 'template.created', { name })
  redirect(`/templates/${data.id}`)
}

export async function saveTemplateSpecAction(id: string, meta: { name: string; family: string; description: string }, spec: unknown): Promise<Res> {
  const me = await requireMe()
  if (!canManageRoles(me)) return { error: 'Only HR can change templates.' }
  const parsed = RoleSpec.safeParse(spec)
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    return { error: `Can't save: ${i.path.join(' › ')} — ${i.message}` }
  }
  if (!meta.name.trim()) return { error: 'The template needs a name.' }
  // Editing a template's content means its calibration no longer applies
  const { error } = await db().from('templates').update({ name: meta.name.trim(), family: meta.family.trim(), description: meta.description.trim(), spec: parsed.data, calibrated: false, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  await audit(null, me.id, 'template.saved', { id })
  revalidatePath('/templates')
  return { ok: 'Template saved. Roles already created from it keep their own copy.' }
}
