import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, GraduationCap, Save, ShieldAlert, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "./components/ui/Avatar";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { EmptyState } from "./components/ui/EmptyState";
import { GlassCard } from "./components/ui/GlassCard";
import { Skeleton } from "./components/ui/Skeleton";
import { request, useCourses, type AdminUser } from "./lib";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => request<{ users: AdminUser[] }>("/admin/users")
  });
  const coursesQuery = useCourses();

  const updateCourse = useMutation({
    mutationFn: ({ userId, courseId }: { userId: string; courseId: string }) =>
      request<{ user: AdminUser }>(`/admin/users/${userId}/course`, {
        method: "PATCH",
        body: JSON.stringify({ courseId })
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    }
  });

  if (usersQuery.isLoading || coursesQuery.isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </section>
    );
  }

  if (usersQuery.error || coursesQuery.error || !usersQuery.data || !coursesQuery.data) {
    return (
      <EmptyState
        icon={<ShieldAlert size={32} className="text-rose-600" />}
        title="Não foi possível carregar usuários"
        description={usersQuery.error?.message ?? coursesQuery.error?.message ?? "Tente novamente em alguns instantes."}
      />
    );
  }

  const courses = coursesQuery.data.courses;
  const users = usersQuery.data.users;

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Usuários</h1>
          <p className="mt-1 text-xs text-slate-500">
            Consulte dados institucionais e ajuste o curso vinculado a cada conta.
          </p>
        </div>
        <Badge variant="blue" dot>
          {users.length} usuários
        </Badge>
      </header>

      <div className="space-y-3">
        {users.map((user) => (
          <UserCourseRow
            key={user.id}
            user={user}
            courses={courses}
            isSaving={updateCourse.isPending && updateCourse.variables?.userId === user.id}
            onSave={(courseId) => updateCourse.mutate({ userId: user.id, courseId })}
          />
        ))}
      </div>

      {!users.length && (
        <EmptyState
          icon={<UserRound size={28} />}
          title="Nenhum usuário cadastrado"
          description="Quando alguém acessar a plataforma, o cadastro aparecerá aqui."
        />
      )}

      {updateCourse.error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          {updateCourse.error.message}
        </p>
      )}
    </section>
  );
}

function UserCourseRow({
  user,
  courses,
  isSaving,
  onSave
}: {
  user: AdminUser;
  courses: Array<{ id: string; name: string }>;
  isSaving: boolean;
  onSave: (courseId: string) => void;
}) {
  const [courseId, setCourseId] = useState(user.courseId ?? "");
  const changed = courseId !== (user.courseId ?? "");
  const canSave = Boolean(courseId) && changed && !isSaving;

  useEffect(() => {
    setCourseId(user.courseId ?? "");
  }, [user.courseId]);

  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px_auto] lg:items-center">
        <div className="flex items-start gap-3 min-w-0">
          <Avatar src={user.avatarUrl} name={user.name} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-sm text-slate-900 line-clamp-1">{user.name}</h2>
              <Badge variant={user.role === "ADMIN" ? "indigo" : "slate"}>{user.role === "ADMIN" ? "Admin" : "Usuário"}</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500 font-mono break-all">{user.email}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span>Cadastrado em {formatDate(user.createdAt)}</span>
              {user.courseConfirmedAt ? (
                <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                  <CheckCircle2 size={12} /> Curso confirmado em {formatDate(user.courseConfirmedAt)}
                </span>
              ) : (
                <span className="text-amber-700 font-medium">Curso ainda não confirmado</span>
              )}
            </div>
          </div>
        </div>

        <label className="block min-w-0">
          <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <GraduationCap size={13} /> Curso
          </span>
          <select
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <option value="" disabled>
              Selecione um curso
            </option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </label>

        <Button
          type="button"
          variant="primary"
          size="sm"
          isLoading={isSaving}
          disabled={!canSave}
          leftIcon={<Save size={15} />}
          onClick={() => onSave(courseId)}
          className="w-full lg:w-auto"
        >
          Salvar
        </Button>
      </div>
    </GlassCard>
  );
}