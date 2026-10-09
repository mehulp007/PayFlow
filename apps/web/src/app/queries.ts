import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditEvent,
  Bootstrap,
  CreatedUser,
  CreateEmployeeBody,
  Employee,
  HierarchySummary,
  ImportPreview,
  ManagerOption,
  Page,
  PayrollLine,
  Payslip,
  RunException,
  RunSummary,
  RunView,
  UpdateEmployeeBody,
  User,
} from '@payflow/shared';
import { api, ApiError } from '../lib/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Client errors (validation, permissions) will not succeed on retry.
      retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 2,
    },
  },
});

/** Mutations change payroll, people and totals together, so every cached query is refreshed. */
function useInvalidateAll() {
  const client = useQueryClient();
  return () => client.invalidateQueries();
}

// Organization and current run

export function useBootstrap() {
  return useQuery({ queryKey: ['run', 'current'], queryFn: () => api.get<Bootstrap>('/bootstrap') });
}

export function isSummary(run: RunView | undefined): run is RunSummary {
  return Boolean(run && 'totalEmployees' in run);
}

export function useCurrentRun() {
  const bootstrap = useBootstrap();
  const run = bootstrap.data?.currentRun;
  return { ...bootstrap, run, summary: isSummary(run) ? run : undefined, runId: run?.id };
}

export type RunAction = 'calculate' | 'submit' | 'approve' | 'reconcile-demo';
export function useRunAction(runId: string | undefined) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ action, body }: { action: RunAction; body?: unknown }) =>
      api.post<RunSummary>(`/runs/${runId}/${action}`, body),
    onSuccess: invalidate,
  });
}

export function useRunLines(
  runId: string | undefined,
  params: { page: number; search: string; exceptionOnly: boolean },
  enabled: boolean,
) {
  const query = new URLSearchParams({
    page: String(params.page),
    size: '20',
    search: params.search,
    exception: String(params.exceptionOnly),
  });
  return useQuery({
    queryKey: ['run', runId, 'lines', params],
    queryFn: () => api.get<Page<PayrollLine>>(`/runs/${runId}/lines?${query}`),
    enabled: Boolean(runId) && enabled,
    placeholderData: previous => previous,
  });
}

export function useExceptions(runId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['run', runId, 'exceptions'],
    queryFn: () => api.get<RunException[]>(`/runs/${runId}/exceptions`),
    enabled: Boolean(runId) && enabled,
  });
}

export function useAudit(runId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['run', runId, 'audit'],
    queryFn: () => api.get<AuditEvent[]>(`/runs/${runId}/audit`),
    enabled: Boolean(runId) && enabled,
  });
}

export function usePayslip(runId: string | undefined, employeeId: string | null) {
  return useQuery({
    queryKey: ['run', runId, 'payslip', employeeId],
    queryFn: () => api.get<Payslip>(`/runs/${runId}/payslip/${employeeId}`),
    enabled: Boolean(runId && employeeId),
    retry: false,
  });
}

export function useImport(runId: string | undefined) {
  const invalidate = useInvalidateAll();
  return {
    preview: useMutation({
      mutationFn: (csv: string) => api.post<ImportPreview>(`/runs/${runId}/import/preview`, { csv }),
    }),
    commit: useMutation({
      mutationFn: (csv: string) => api.post<{ imported: number }>(`/runs/${runId}/import/commit`, { csv }),
      onSuccess: invalidate,
    }),
  };
}

// People

export type EmployeeFilters = Partial<Record<'search' | 'employmentType' | 'level' | 'department' | 'state', string>>;
export function useEmployees(page: number, size: number, filters: EmployeeFilters = {}) {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  return useQuery({
    queryKey: ['employees', page, size, filters],
    queryFn: () => api.get<Page<Employee>>(`/employees?${query}`),
    placeholderData: previous => previous,
  });
}

export function useEmployee(id: string | null | undefined) {
  return useQuery({
    queryKey: ['employee', id],
    queryFn: () => api.get<Employee>(`/employees/${id}`),
    enabled: Boolean(id),
  });
}

export function useUpdateEmployee() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: UpdateEmployeeBody }) =>
      api.patch<{ message: string }>(`/employees/${id}`, changes),
    onSuccess: invalidate,
  });
}

export function useCreateEmployee() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: CreateEmployeeBody) => api.post<Employee>('/employees', body),
    onSuccess: invalidate,
  });
}

export function useHierarchySummary() {
  return useQuery({
    queryKey: ['hierarchy', 'summary'],
    queryFn: () => api.get<HierarchySummary>('/hierarchy/summary'),
  });
}

export function useManagers(level: number, search: string, enabled: boolean) {
  return useQuery({
    queryKey: ['hierarchy', 'managers', level, search],
    queryFn: () =>
      api.get<ManagerOption[]>(`/hierarchy/managers?${new URLSearchParams({ level: String(level), search })}`),
    enabled,
  });
}

// Accounts

export function useUsers(enabled: boolean) {
  return useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/auth/users'), enabled });
}

export function useAccountMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ['users'] });
  return {
    create: useMutation({
      mutationFn: (body: { username: string; role: string; employeeId?: string }) =>
        api.post<CreatedUser>('/auth/users', body),
      onSuccess: refresh,
    }),
    resetPassword: useMutation({
      mutationFn: (id: string) => api.post<{ temporaryPassword: string }>(`/auth/users/${id}/reset-password`),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/auth/users/${id}`), onSuccess: refresh }),
    changePassword: useMutation({
      mutationFn: (body: { currentPassword: string; newPassword: string }) => api.post('/auth/change-password', body),
    }),
  };
}

export function useDemoReset() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: () => api.post<RunSummary>('/demo/reset'), onSuccess: invalidate });
}
