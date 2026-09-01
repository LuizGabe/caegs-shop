import React from "react";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { GlassCard } from "../components/ui/GlassCard";
import { useAuth, useCourses, useLogout } from "../lib";
import { GraduationCap, Mail, ShieldAlert, LogOut, Lock, Database } from "lucide-react";

export const ProfilePage: React.FC = () => {
  const { data: authData } = useAuth();
  const { data: coursesData } = useCourses();
  const logout = useLogout();

  const user = authData?.user;
  if (!user) return null;

  const course = coursesData?.courses.find((c) => c.id === user.courseId);

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Perfil Institucional</h1>
        <p className="text-xs text-slate-500 mt-1">
          Suas informações de cadastro vinculado à plataforma do Centro Acadêmico.
        </p>
      </div>

      <GlassCard className="p-6 sm:p-8">
        {/* Header Profile Info */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 pb-6 border-b border-slate-100">
          <Avatar src={user.avatarUrl} name={user.name} size="xl" className="shadow-md" />
          <div className="text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl font-bold text-slate-900">{user.name}</h2>
              {user.role === "ADMIN" && (
                <Badge variant="indigo" dot>
                  ADMINISTRADOR
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 font-mono mt-1">{user.email}</p>
            <p className="text-[11px] text-slate-400 mt-2 flex items-center justify-center sm:justify-start gap-1">
              <ShieldAlert size={13} className="text-blue-600" />
              Autenticado via Google Workspace (UNIJUÍ)
            </p>
          </div>
        </div>

        {/* Readonly Info Sections */}
        <div className="py-6 space-y-4">
          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              <Mail size={14} className="text-slate-400" />
              E-mail Institucional
            </div>
            <p className="text-sm font-medium text-slate-800 font-mono">{user.email}</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <GraduationCap size={14} className="text-blue-600" />
                Curso Cadastrado
              </div>
              <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                <Lock size={10} /> Somente leitura
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {course ? course.name : user.courseId ? "Carregando..." : "Não informado"}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Para alteração de curso, entre em contato com a gestão do Centro Acadêmico.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-800 uppercase tracking-wider mb-2">
              <Database size={14} />
              Privacidade
            </div>
            <div className="space-y-2 text-xs leading-relaxed text-slate-600">
              <p>A plataforma utiliza seu nome, e-mail institucional, curso, pedidos e status de pagamento para operar a loja e as retiradas.</p>
              <p>Google e usado para autenticacao, Asaas para pagamento PIX e Resend para notificacoes quando ativadas.</p>
              <p>Para solicitar correcao, revisao ou anonimização de dados, entre em contato com a gestao do Centro Academico.</p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <Button
            variant="outline"
            size="md"
            isLoading={logout.isPending}
            onClick={() => logout.mutate()}
            leftIcon={<LogOut size={16} />}
            className="text-rose-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-800"
          >
            Sair da Conta
          </Button>
        </div>
      </GlassCard>
    </div>
  );
};

