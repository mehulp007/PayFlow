import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditEvent,
  Bootstrap,
  Branch,
  ComplianceRules,
  CreatedInvitation,
  CreateEmployeeBody,
  CreateRunBody,
  Employee,
  HierarchySummary,
  ImportPreview,
  Invitation,
  InviteBody,
  LoginResult,
  ManagerOption,
  Page,
  PayGroup,
  PayrollLine,
  Payslip,
  Role,
  RunException,
  RunStatus,
  RunSummary,
  RunView,
  SalaryRevision,
  SalaryRevisionBody,
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

/**
 * Mutations change payroll, people and totals together, so every cached query is refreshed. The refresh runs
 * in the background: the mutation resolves (and its confirmation shows) as soon as the server has accepted it.
 */
function useInvalidateAll() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries();
  };
}

// Organization and runs

export function useBootstrap() {
  return useQuery({ queryKey: ['bootstrap'], queryFn: () => api.get<Bootstrap>('/bootstrap') });
}

export function isSummary(run: RunView | null | undefined): run is RunSummary {
  return Boolean(run && 'totalEmployees' in run);
}

/** The organization's latest run, which the overview and topbar show by default. */
export function useCurrentRun() {
  const bootstrap = useBootstrap();
  const run = bootstrap.data?.currentRun ?? null;
  return { ...bootstrap, run, summary: isSummary(run) ? run : undefined, runId: run?.id };
}

export function useRuns(enabled = true) {
  return useQuery({ queryKey: ['runs'], queryFn: () => api.get<RunSummary[]>('/runs'), enabled });
}

export function useRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['runs', runId],
    queryFn: () => api.get<RunSummary>(`/runs/${runId}`),
    enabled: Boolean(runId),
  });
}

export function useCreateRun() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: CreateRunBody) => api.post<RunSummary>('/runs', body),
    onSuccess: invalidate,
  });
}

export type RunAction = 'calculate' | 'submit' | 'approve' | 'reject' | 'reconcile' | 'close';
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
    queryKey: ['runs', runId, 'lines', params],
    queryFn: () => api.get<Page<PayrollLine>>(`/runs/${runId}/lines?${query}`),
    enabled: Boolean(runId) && enabled,
    placeholderData: previous => previous,
  });
}

export function useExceptions(runId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['runs', runId, 'exceptions'],
    queryFn: () => api.get<RunException[]>(`/runs/${runId}/exceptions`),
    enabled: Boolean(runId) && enabled,
  });
}

export function useAudit(runId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['runs', runId, 'audit'],
    queryFn: () => api.get<AuditEvent[]>(`/runs/${runId}/audit`),
    enabled: Boolean(runId) && enabled,
  });
}

export function usePayslip(runId: string | undefined, employeeId: string | null) {
  return useQuery({
    queryKey: ['runs', runId, 'payslip', employeeId],
    queryFn: () => api.get<Payslip>(`/runs/${runId}/payslip/${employeeId}`),
    enabled: Boolean(runId && employeeId),
    retry: false,
  });
}

export interface MyPayslip {
  runId: string;
  year: number;
  month: number;
  status: RunStatus;
  gross: number;
  net: number;
}
export function useMyPayslips(enabled: boolean) {
  return useQuery({ queryKey: ['me', 'payslips'], queryFn: () => api.get<MyPayslip[]>('/me/payslips'), enabled });
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

export type EmployeeFilters = Partial<
  Record<'search' | 'employmentType' | 'level' | 'department' | 'state' | 'status', string>
>;
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

export function useEmployeeMutations() {
  const invalidate = useInvalidateAll();
  return {
    update: useMutation({
      mutationFn: ({ id, changes }: { id: string; changes: UpdateEmployeeBody }) =>
        api.patch<{ message: string }>(`/employees/${id}`, changes),
      onSuccess: invalidate,
    }),
    create: useMutation({
      mutationFn: (body: CreateEmployeeBody) => api.post<Employee>('/employees', body),
      onSuccess: invalidate,
    }),
    revise: useMutation({
      mutationFn: ({ id, body }: { id: string; body: SalaryRevisionBody }) =>
        api.post<SalaryRevision[]>(`/employees/${id}/salary-revisions`, body),
      onSuccess: invalidate,
    }),
    exit: useMutation({
      mutationFn: ({ id, exitDate, reason }: { id: string; exitDate: string; reason: string }) =>
        api.post<Employee>(`/employees/${id}/exit`, { exitDate, reason }),
      onSuccess: invalidate,
    }),
  };
}

export function useSalaryRevisions(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['employee', id, 'revisions'],
    queryFn: () => api.get<SalaryRevision[]>(`/employees/${id}/salary-revisions`),
    enabled: Boolean(id) && enabled,
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

// Organization settings and accounts

export function useOrganizationMutations() {
  const invalidate = useInvalidateAll();
  return {
    addBranch: useMutation({
      mutationFn: (body: { name: string; state: string }) => api.post<Branch>('/organization/branches', body),
      onSuccess: invalidate,
    }),
    addPayGroup: useMutation({
      mutationFn: (name: string) => api.post<PayGroup>('/organization/pay-groups', { name }),
      onSuccess: invalidate,
    }),
    resetSample: useMutation({
      mutationFn: () => api.post<Bootstrap>('/organization/reset-sample'),
      onSuccess: invalidate,
    }),
  };
}

export function useViewAs() {
  return useMutation({ mutationFn: (role: Role) => api.post<LoginResult>('/organization/view-as', { role }) });
}

export function useComplianceRules() {
  return useQuery({ queryKey: ['compliance', 'rules'], queryFn: () => api.get<ComplianceRules>('/compliance/rules') });
}

export function useUsers(enabled: boolean) {
  return useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/auth/users'), enabled });
}

export function useInvitations(enabled: boolean) {
  return useQuery({ queryKey: ['invitations'], queryFn: () => api.get<Invitation[]>('/invitations'), enabled });
}

export function useAccountMutations() {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['users'] });
    void client.invalidateQueries({ queryKey: ['invitations'] });
  };
  return {
    invite: useMutation({
      mutationFn: (body: InviteBody) => api.post<CreatedInvitation>('/invitations', body),
      onSuccess: refresh,
    }),
    revoke: useMutation({ mutationFn: (id: string) => api.delete(`/invitations/${id}`), onSuccess: refresh }),
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
