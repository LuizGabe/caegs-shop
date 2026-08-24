import React, { useState } from "react";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { GlassCard } from "../components/ui/GlassCard";
import { Skeleton } from "../components/ui/Skeleton";
import { useAuth, useCourses, useCompleteProfile, ApiError } from "../lib";
import { CheckCircle2, AlertTriangle, GraduationCap } from "lucide-react";

export const OnboardingPage: React.FC = () => {
  const { data: authData } = useAuth();
  const { data: coursesData, isLoading: isLoadingCourses } = useCourses();
  const completeProfile = useCompleteProfile();

  const user = authData?.user;
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!user) return null;

  const selectedCourse = coursesData?.courses.find((c) => c.id === selectedCourseId);

  const handleConfirmSubmit = async () => {
    if (!selectedCourseId) return;
    setErrorMsg(null);
    try {
      await completeProfile.mutateAsync(selectedCourseId);
    } catch (err) {
      const apiErr = err as ApiError;
      setErrorMsg(apiErr.message || "Não foi possível salvar o curso.");
      setIsConfirmModalOpen(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center py-8 px-4">
      <div className="w-full max-w-xl">
        <GlassCard className="p-6 sm:p-8">
          {/* Header & User Info */}
          <div className="flex flex-col items-center text-center border-b border-slate-100 pb-6 mb-6">
            <Avatar src={user.avatarUrl} name={user.name} size="xl" className="mb-4 shadow-md" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Olá, {user.name.split(" ")[0]} 👋
            </h1>
            <p className="text-sm font-medium text-slate-700 mt-1">{user.name}</p>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{user.email}</p>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 text-slate-900 font-semibold text-base mb-1">
              <GraduationCap className="text-blue-700" size={20} />
              <h2>Selecione seu Curso</h2>
            </div>
            <p className="text-xs text-slate-500">
              Para prosseguir para a loja e acompanhar seus pedidos, informe seu curso de vínculo na UNIJUÍ.
            </p>
          </div>

          {/* Courses Options */}
          {isLoadingCourses ? (
            <div className="space-y-3 mb-6">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : (
            <div className="space-y-2.5 mb-6">
              {coursesData?.courses.map((course) => {
                const isSelected = selectedCourseId === course.id;
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => setSelectedCourseId(course.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-150 flex items-center justify-between active-press ${isSelected
                        ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                        : "bg-white/70 border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/80"
                      }`}
                  >
                    <div>
                      <span className={`block font-medium text-sm ${isSelected ? "text-blue-950" : "text-slate-800"}`}>
                        {course.name}
                      </span>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ml-3 transition-colors ${isSelected
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 bg-white"
                        }`}
                    >
                      {isSelected && <CheckCircle2 size={14} className="stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Explicit Warning Callout */}
          <div className="rounded-xl bg-amber-50/80 border border-amber-200/80 p-4 text-xs text-amber-900 mb-6 flex gap-3">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold block mb-0.5">Atenção sobre a escolha:</span>
              Após a confirmação, o curso <strong className="font-semibold">não poderá ser alterado pelo próprio usuário</strong>. Se selecionar incorretamente, será necessário entrar em contato com o Centro Acadêmico.
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 mb-6">
              {errorMsg}
            </div>
          )}

          {/* Action */}
          <Button
            type="button"
            className="w-full"
            size="lg"
            disabled={!selectedCourseId || completeProfile.isPending}
            onClick={() => setIsConfirmModalOpen(true)}
          >
            Confirmar e Continuar
          </Button>
        </GlassCard>
      </div>

      {/* Confirmation Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <GlassCard className="w-full max-w-md p-6 bg-white shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Confirmar seleção de curso?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Você está definindo seu curso como: <strong className="text-slate-900 font-semibold">{selectedCourse?.name}</strong>.
            </p>
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              Esta ação é definitiva e não poderá ser alterada por você posteriormente.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={completeProfile.isPending}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                isLoading={completeProfile.isPending}
                onClick={handleConfirmSubmit}
              >
                Sim, confirmar curso
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};

