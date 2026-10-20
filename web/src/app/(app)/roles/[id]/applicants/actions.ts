'use server'
import { revalidatePath } from 'next/cache'
import { requireOpenRole } from '@/lib/auth'
import { getRole } from '@/lib/data/roles'
import { commitImport, fetchSheet, ImportError, previewSheet, type CommitResult, type ImportPreview } from '@/lib/data/imports'
import { humanDecision } from '@/lib/data/candidates'
import { parseCsv } from '@/lib/import/sheet'
import type { ColumnMapping } from '@/lib/import/mapping'
import { nextStage, stageLabel } from '@/lib/pipeline/stages'
import { db } from '@/lib/supabase/server'

type Source = { url: string } | { csv: string; fileName: string }

const MAX_CSV = 8 * 1024 * 1024

async function readSource(src: Source): Promise<{ csv: string; label: string }> {
  if ('url' in src) return { csv: await fetchSheet(src.url.trim()), label: src.url.trim() }
  if (src.csv.length > MAX_CSV) throw new ImportError('That file is over 8 MB. Remove unused columns and try again.')
  return { csv: src.csv, label: `Uploaded file: ${src.fileName}` }
}

const fail = (e: unknown) => ({ error: e instanceof ImportError ? e.message : e instanceof Error ? `Something went wrong: ${e.message}` : 'Something went wrong.' })

export async function previewImportAction(roleId: string, src: Source): Promise<{ preview?: ImportPreview; error?: string }> {
  try {
    await requireOpenRole(roleId)
    const role = await getRole(roleId)
    if (!role) return { error: 'Role not found.' }
    const { csv } = await readSource(src)
    const preview = previewSheet(csv, role.spec)
    if (preview.applicantRows === 0) return { error: `The sheet has ${preview.totalRows} rows but none with an applicant's name, email or answers.` }
    return { preview }
  } catch (e) {
    return fail(e)
  }
}

export async function commitImportAction(
  roleId: string,
  src: Source,
  mapping: ColumnMapping,
  questionLinks: Record<string, string>,
): Promise<{ result?: CommitResult; error?: string }> {
  try {
    const me = await requireOpenRole(roleId)
    const role = await getRole(roleId)
    if (!role) return { error: 'Role not found.' }
    if (role.status === 'closed') return { error: 'This role is closed.' }
    const { csv, label } = await readSource(src)
    const result = await commitImport({ roleId, spec: role.spec, actorId: me.id, sourceUrl: label, sheet: parseCsv(csv), mapping, questionLinks })
    revalidatePath(`/roles/${roleId}`, 'layout')
    return { result }
  } catch (e) {
    return fail(e)
  }
}

export async function decideAction(roleId: string, candidateId: string, action: 'restore' | 'stop' | 'advance', reason: string): Promise<{ error?: string; ok?: string }> {
  try {
    const me = await requireOpenRole(roleId)
    const role = await getRole(roleId)
    if (!role) return { error: 'Role not found.' }
    const { data: before } = await db().from('candidates').select('stage, status').eq('id', candidateId).eq('role_id', roleId).single()
    await humanDecision({ roleId, candidateId, actorId: me.id, action, reason, nextStageOf: s => nextStage(role.spec, s) })
    revalidatePath(`/roles/${roleId}`, 'layout')
    const { data: now } = await db().from('candidates').select('stage, status').eq('id', candidateId).single()
    const where = now ? (now.status === 'hired' ? 'hired' : stageLabel(role.spec, now.stage)) : ''
    const stayed = action === 'advance' && before?.status === 'active' && now?.stage === before?.stage
    return { ok: action === 'stop' ? 'Stopped. They stay in the history and can be restored.' : action === 'restore' ? `Restored — now at ${where}.` : now?.status === 'hired' ? 'Marked as hired.' : stayed ? 'Place guaranteed — they move on when the cut is applied.' : `Moved forward — now at ${where}.` }
  } catch (e) {
    return fail(e)
  }
}
