import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Customer } from '@/lib/types';

// ─── Customer row ─────────────────────────────────────────────────────────────

function CustomerRow({ c }: { c: Customer }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
        <p className="text-xs text-slate-400">{c.email}</p>
      </div>
      <div className="ml-4 shrink-0 text-right">
        <p className="text-xs text-slate-500">{c.city ?? '—'}</p>
        {c.tags.length > 0 && (
          <p className="text-xs text-indigo-500 mt-0.5">{c.tags.slice(0, 2).join(', ')}</p>
        )}
      </div>
    </div>
  );
}

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateCustomerForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', phone: '', city: '', tags: '' });

  const mutation = useMutation({
    mutationFn: () =>
      api.customers.create({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        city: form.city.trim() || undefined,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <p className="font-semibold text-slate-800">Add Customer</p>
        <div className="grid grid-cols-2 gap-3">
          {([['name', 'Full Name', true], ['email', 'Email', true], ['phone', 'Phone', false], ['city', 'City', false]] as const).map(
            ([key, label, required]) => (
              <div key={key} className="space-y-1">
                <label className="text-xs text-slate-500">{label}{required && ' *'}</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form[key]} onChange={set(key)}
                />
              </div>
            )
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Tags (comma-separated)</label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="vip, loyal, new"
            value={form.tags} onChange={set('tags')}
          />
        </div>
        {mutation.error && (
          <p className="text-xs text-red-500">{(mutation.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1"
            disabled={!form.name.trim() || !form.email.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Adding…</> : 'Add Customer'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, page],
    queryFn: () => api.customers.list({ search: search || undefined, page, limit: 20 }),
    staleTime: 15_000,
  });

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">
            {data?.pagination.total ? `${data.pagination.total} total` : ''}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Customer
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Search by name, email or city…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {creating && <CreateCustomerForm onClose={() => setCreating(false)} />}

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !data?.data.length ? (
            <p className="py-8 text-center text-sm text-slate-400">No customers found.</p>
          ) : (
            <>
              {data.data.map((c: Customer) => <CustomerRow key={c.id} c={c} />)}

              {/* Pagination */}
              {data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                  <Button
                    variant="outline" size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >Previous</Button>
                  <span className="text-xs text-slate-500">
                    {page} / {data.pagination.totalPages}
                  </span>
                  <Button
                    variant="outline" size="sm"
                    disabled={page >= data.pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >Next</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
