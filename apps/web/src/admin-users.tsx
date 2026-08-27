import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, GraduationCap, Package, ReceiptText, Save, ShieldAlert, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "./components/ui/Avatar";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { EmptyState } from "./components/ui/EmptyState";
import { GlassCard } from "./components/ui/GlassCard";
import { Skeleton } from "./components/ui/Skeleton";
import { currency, request, useCourses, type AdminUser } from "./lib";

type AdminUserOrder = {
  id: string;
  publicId: string;
  humanReadableId: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  total: number;
  createdAt: string;
  items: Array<{ id: string; productNameSnapshot: string; variantNameSnapshot: string; quantity: number; totalPrice: number }>;
};

const paymentLabels: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Pago",
  FAILED: "Falhou",
  REFUNDED: "Reembolsado",
  CANCELLED: "Cancelado",
  REFUND_PENDING: "Reembolso pendente"
};

const fulfillmentLabels: Record<string, string> = {
  WAITING_PAYMENT: "Aguardando pagamento",
  PAID: "Pago",
  WAITING_PRODUCTION: "Aguardando producao",
  IN_PRODUCTION: "Em producao",
  RECEIVED_FROM_SUPPLIER: "Recebido do fornecedor",
  READY_FOR_PICKUP: "Disponivel para retirada",
  PICKED_UP: "Retirado",
  CANCELLED: "Cancelado"
};

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
  const [ordersUser, setOrdersUser] = useState<AdminUser | null>(null);

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
            onViewOrders={() => setOrdersUser(user)}
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

      {ordersUser && <UserOrdersModal user={ordersUser} onClose={() => setOrdersUser(null)} />}
    </section>
  );
}

function UserCourseRow({
  user,
  courses,
  isSaving,
  onSave,
  onViewOrders
}: {
  user: AdminUser;
  courses: Array<{ id: string; name: string }>;
  isSaving: boolean;
  onSave: (courseId: string) => void;
  onViewOrders: () => void;
}) {
  const [courseId, setCourseId] = useState(user.courseId ?? "");
  const changed = courseId !== (user.courseId ?? "");
  const canSave = Boolean(courseId) && changed && !isSaving;

  useEffect(() => {
    setCourseId(user.courseId ?? "");
  }, [user.courseId]);

  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px_auto_auto] lg:items-center">
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

        <Button type="button" variant="secondary" size="sm" leftIcon={<ReceiptText size={15} />} onClick={onViewOrders} className="w-full lg:w-auto">
          Pedidos
        </Button>

        <Button type="button" variant="primary" size="sm" isLoading={isSaving} disabled={!canSave} leftIcon={<Save size={15} />} onClick={() => onSave(courseId)} className="w-full lg:w-auto">
          Salvar
        </Button>
      </div>
    </GlassCard>
  );
}

function UserOrdersModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const ordersQuery = useQuery({
    queryKey: ["admin-user-orders", user.id],
    queryFn: () => request<{ orders: AdminUserOrder[] }>(`/admin/users/${user.id}/orders`)
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <GlassCard className="max-h-[90vh] w-full max-w-3xl overflow-hidden bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pedidos do usuario</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900 line-clamp-1">{user.name}</h2>
            <p className="mt-0.5 break-all font-mono text-xs text-slate-500">{user.email}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="Fechar modal de pedidos">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(90vh-112px)] overflow-y-auto p-5">
          {ordersQuery.isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
          )}

          {ordersQuery.error && (
            <EmptyState icon={<ShieldAlert size={28} />} title="Nao foi possivel carregar pedidos" description={ordersQuery.error.message} />
          )}

          {!ordersQuery.isLoading && !ordersQuery.error && !ordersQuery.data?.orders.length && (
            <EmptyState icon={<Package size={28} />} title="Nenhum pedido encontrado" description="Este usuario ainda nao fez pedidos." />
          )}

          <div className="space-y-3">
            {ordersQuery.data?.orders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-semibold text-slate-500">Pedido #{order.humanReadableId}</p>
                    <time className="mt-1 block text-[11px] text-slate-400">{formatDate(order.createdAt)}</time>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-extrabold text-slate-900">{currency.format(order.total)}</p>
                    <div className="mt-1 flex flex-wrap justify-end gap-1.5">
                      <Badge variant={order.paymentStatus === "CONFIRMED" ? "blue" : "amber"}>{paymentLabels[order.paymentStatus] ?? order.paymentStatus}</Badge>
                      <Badge variant="slate">{fulfillmentLabels[order.fulfillmentStatus] ?? order.fulfillmentStatus}</Badge>
                    </div>
                  </div>
                </div>

                <div className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                      <div className="min-w-0">
                        <p className="line-clamp-1 font-semibold text-slate-800">{item.productNameSnapshot}</p>
                        <p className="text-slate-500">{item.variantNameSnapshot}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold text-slate-700">x{item.quantity}</p>
                        <p className="text-[11px] text-slate-500">{currency.format(item.totalPrice)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
