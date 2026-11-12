import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Calendar, Edit3, FileUp, Megaphone, Plus, Send, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorBanner, LoadingState } from '../components/ui/States';

interface NoticeRow {
  id: number;
  title: string;
  description: string;
  category: string;
  attachment_url: string | null;
  target_type: 'all' | 'blocks' | 'groups' | 'students';
  target_ids: Array<number | string>;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  publish_at: string | null;
  author_name: string | null;
  created_at: string;
}

const NOTICE_CATEGORIES = ['General', 'Mess', 'Maintenance', 'Rules', 'Event', 'Urgent'];
const STUDENT_GROUPS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

export const NoticesPage: React.FC = () => {
  const { can } = useAuth();
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, published: 0, draft: 0, scheduled: 0, archived: 0 });
  const [blocks, setBlocks] = useState<Array<{ id: number; name: string }>>([]);
  const [students, setStudents] = useState<Array<{ id: number; student_code: string; full_name: string }>>([]);

  const [statusFilter, setStatusFilter] = useState('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'General',
    attachment_url: null as string | null,
    target_type: 'all' as 'all' | 'blocks' | 'groups' | 'students',
    target_ids: [] as Array<number | string>,
    status: 'published' as 'draft' | 'scheduled' | 'published' | 'archived',
    publish_at: '',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NoticeRow | null>(null);

  const loadNotices = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (q.trim()) params.set('q', q.trim());

      const res = await api.get<{
        notices: NoticeRow[];
        summary: { total: number; published: number; draft: number; scheduled: number; archived: number };
      }>(`/api/notices?${params.toString()}`);
      setNotices(res.notices);
      setSummary(res.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notices');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, q]);

  useEffect(() => {
    loadNotices();
  }, [loadNotices]);

  useEffect(() => {
    Promise.all([
      api.get<{ blocks: Array<{ id: number; name: string }> }>('/api/rooms/overview').catch(() => ({ blocks: [] })),
      api.get<{ students: Array<{ id: number; student_code: string; full_name: string }> }>('/api/students?status=active').catch(() => ({ students: [] })),
    ]).then(([rRes, sRes]) => {
      setBlocks(rRes.blocks);
      setStudents(sRes.students);
    });
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      title: '',
      description: '',
      category: 'General',
      attachment_url: null,
      target_type: 'all',
      target_ids: [],
      status: 'published',
      publish_at: '',
    });
    setFormError('');
    setEditorOpen(true);
  };

  const openEdit = (n: NoticeRow) => {
    setEditingId(n.id);
    setForm({
      title: n.title,
      description: n.description,
      category: n.category,
      attachment_url: n.attachment_url,
      target_type: n.target_type,
      target_ids: n.target_ids,
      status: n.status,
      publish_at: n.publish_at || '',
    });
    setFormError('');
    setEditorOpen(true);
  };

  const handleAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await api.upload(file);
      setForm((prev) => ({ ...prev, attachment_url: up.url }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Attachment upload failed');
    }
  };

  const toggleTargetId = (val: number | string) => {
    setForm((prev) => ({
      ...prev,
      target_ids: prev.target_ids.includes(val)
        ? prev.target_ids.filter((x) => x !== val)
        : [...prev.target_ids, val],
    }));
  };

  const submitNotice = async (targetStatus: 'draft' | 'scheduled' | 'published' | 'archived') => {
    setFormError('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        status: targetStatus,
        publish_at: targetStatus === 'scheduled' ? form.publish_at : form.publish_at || null,
      };
      if (editingId) {
        await api.put(`/api/notices/${editingId}`, payload);
      } else {
        await api.post('/api/notices', payload);
      }
      setEditorOpen(false);
      await loadNotices();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save notice');
    } finally {
      setSaving(false);
    }
  };

  const quickUpdateStatus = async (n: NoticeRow, status: NoticeRow['status']) => {
    try {
      await api.put(`/api/notices/${n.id}`, { status });
      await loadNotices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notice');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await api.delete(`/api/notices/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadNotices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete notice');
    } finally {
      setSaving(false);
    }
  };

  const formatAudience = (n: NoticeRow) => {
    if (n.target_type === 'all') return 'All Students';
    if (n.target_type === 'blocks') {
      const names = n.target_ids.map((id) => blocks.find((b) => b.id === Number(id))?.name || `Block #${id}`);
      return `Blocks: ${names.join(', ') || 'None'}`;
    }
    if (n.target_type === 'groups') return `Groups: ${n.target_ids.join(', ')}`;
    return `${n.target_ids.length} Selected Student(s)`;
  };

  return (
    <div>
      <PageHeader
        title="Notices & Announcements"
        subtitle="Create, schedule, target, and publish official hostel notices"
        actions={
          can('notices', 'create') ? (
            <button
              type="button"
              onClick={openCreate}
              className="h-[40px] px-4 rounded-[8px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] flex items-center gap-2 hover:bg-[#333333]"
            >
              <Plus className="w-4 h-4" />
              Create Notice
            </button>
          ) : null
        }
      />

      {error ? <ErrorBanner message={error} onRetry={loadNotices} /> : null}

      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard label="Total Notices" value={summary.total || 0} icon={Megaphone} tone="neutral" />
        <StatCard label="Published" value={summary.published || 0} icon={Send} tone="lime" />
        <StatCard label="Scheduled" value={summary.scheduled || 0} icon={Calendar} tone="blue" />
        <StatCard label="Drafts" value={summary.draft || 0} icon={Edit3} tone="lavender" />
      </div>

      {/* Filters */}
      <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-4 mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {(['all', 'published', 'scheduled', 'draft', 'archived'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3.5 py-2 rounded-[8px] text-[15px] font-semibold leading-[1.3] capitalize ${
                statusFilter === s
                  ? 'bg-[#222222] text-white'
                  : 'bg-[#F4F4F4] text-[#292929] hover:bg-[#E9E9E9]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notice title or category..."
          className="w-[300px] h-[40px] px-3 text-[16px] font-normal leading-[1.45] bg-[#F4F4F4] rounded-[8px] focus:outline-none"
        />
      </div>

      {loading ? (
        <LoadingState label="Loading notices..." />
      ) : notices.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No notices found"
          description="Create a new notice or switch status filter."
        />
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <div
              key={n.id}
              className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-5 flex items-start justify-between gap-6"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="text-[13px] font-semibold uppercase tracking-wide px-2.5 py-0.5 rounded bg-[#F4F4F4] text-[#292929]">
                    {n.category}
                  </span>
                  <span
                    className={`text-[14px] font-semibold leading-[1.35] capitalize ${
                      n.status === 'published'
                        ? 'text-[#22A06B]'
                        : n.status === 'scheduled'
                          ? 'text-[#C97A16]'
                          : 'text-[#777777]'
                    }`}
                  >
                    {n.status}
                  </span>
                  <span className="text-[14px] leading-[1.45] text-[#777777]">Audience: {formatAudience(n)}</span>
                </div>
                <h3 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929]">{n.title}</h3>
                <p className="text-[16px] font-normal leading-[1.5] text-[#777777] mt-1">{n.description}</p>
                <div className="flex items-center gap-4 mt-2.5 text-[14px] leading-[1.45] text-[#777777]">
                  <span>Author: {n.author_name || 'Admin'}</span>
                  {n.publish_at ? <span>Publish Date: {n.publish_at.replace('T', ' ')}</span> : null}
                  {n.attachment_url ? (
                    <a
                      href={n.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[#292929] underline"
                    >
                      View Attachment
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {can('notices', 'edit') ? (
                  <>
                    {n.status !== 'published' ? (
                      <button
                        type="button"
                        onClick={() => quickUpdateStatus(n, 'published')}
                        className="px-3.5 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[7px]"
                      >
                        Publish
                      </button>
                    ) : null}
                    {n.status !== 'archived' ? (
                      <button
                        type="button"
                        onClick={() => quickUpdateStatus(n, 'archived')}
                        title="Archive Notice"
                        className="p-2 rounded-[7px] text-[#777777] hover:text-[#292929] hover:bg-[#F4F4F4]"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openEdit(n)}
                      title="Edit Notice"
                      className="p-2 rounded-[7px] text-[#777777] hover:text-[#292929] hover:bg-[#F4F4F4]"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </>
                ) : null}
                {can('notices', 'delete') ? (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(n)}
                    title="Delete Notice"
                    className="p-2 rounded-[7px] text-[#777777] hover:text-[#D9383A] hover:bg-[#D9383A]/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Composer Modal */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId ? 'Edit Notice' : 'Create Hostel Notice'}
        maxWidth="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => submitNotice('draft')}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px] hover:bg-[#F4F4F4]"
            >
              Save Draft
            </button>
            {form.publish_at ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => submitNotice('scheduled')}
                className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#B5DDEC] text-[#292929] rounded-[8px]"
              >
                Schedule
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => submitNotice('published')}
              className="px-4 py-2 text-[15px] font-semibold leading-[1.3] bg-[#222222] text-white rounded-[8px]"
            >
              {saving ? 'Saving...' : 'Publish Now'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? <ErrorBanner message={formError} /> : null}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Notice Title *</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              >
                {NOTICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Description *</label>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full p-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">Target Audience</label>
              <select
                value={form.target_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    target_type: e.target.value as 'all' | 'blocks' | 'groups' | 'students',
                    target_ids: [],
                  })
                }
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              >
                <option value="all">All Students</option>
                <option value="blocks">Specific Blocks</option>
                <option value="groups">Specific Academic Groups</option>
                <option value="students">Selected Students</option>
              </select>
            </div>
            <div>
              <label className="block text-[15px] font-semibold leading-[1.4] mb-1">
                Schedule Publication Date/Time (Optional)
              </label>
              <input
                type="datetime-local"
                value={form.publish_at}
                onChange={(e) => setForm({ ...form, publish_at: e.target.value })}
                className="w-full h-[40px] px-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px]"
              />
            </div>
          </div>

          {form.target_type === 'blocks' ? (
            <div className="flex flex-wrap gap-2">
              {blocks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleTargetId(b.id)}
                  className={`px-3 py-1.5 text-[15px] font-semibold leading-[1.3] rounded-[7px] border ${
                    form.target_ids.includes(b.id)
                      ? 'bg-[#222222] text-white border-[#222222]'
                      : 'bg-white text-[#292929] border-[#E9E9E9]'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          ) : null}

          {form.target_type === 'groups' ? (
            <div className="flex flex-wrap gap-2">
              {STUDENT_GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleTargetId(g)}
                  className={`px-3 py-1.5 text-[15px] font-semibold leading-[1.3] rounded-[7px] border ${
                    form.target_ids.includes(g)
                      ? 'bg-[#222222] text-white border-[#222222]'
                      : 'bg-white text-[#292929] border-[#E9E9E9]'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          ) : null}

          {form.target_type === 'students' ? (
            <div className="max-h-[140px] overflow-y-auto border border-[#E9E9E9] rounded-[8px] p-2.5 grid grid-cols-2 gap-1.5">
              {students.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-[14px] leading-[1.45] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.target_ids.includes(s.id)}
                    onChange={() => toggleTargetId(s.id)}
                  />
                  <span className="truncate">{s.full_name} ({s.student_code})</span>
                </label>
              ))}
            </div>
          ) : null}

          <div>
            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-[15px] font-semibold leading-[1.3] border border-[#E9E9E9] rounded-[8px] cursor-pointer hover:bg-[#F4F4F4]">
              <FileUp className="w-4 h-4 text-[#777777]" />
              {form.attachment_url ? 'Attachment Uploaded' : 'Upload Attachment (PDF/Image)'}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleAttachment} className="hidden" />
            </label>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={saving}
        title="Delete Notice"
        message={`Permanently delete notice "${deleteTarget?.title}"?`}
        confirmLabel="Delete Notice"
      />
    </div>
  );
};

