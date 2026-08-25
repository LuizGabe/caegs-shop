import React, { useState } from "react";
import { GoogleButton } from "../components/ui/GoogleButton";
import { apiUrl } from "../lib";
import { ShoppingBag, PackageCheck, ShieldCheck } from "lucide-react";

export const WelcomePage: React.FC = () => {
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleLogin = () => {
    setIsRedirecting(true);
    window.location.href = `${apiUrl}/auth/google`;
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-xl text-center">
        {/* Emblem / Identity */}
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-white shadow-xl shadow-blue-950/10 mb-6 ring-4 ring-white overflow-hidden p-0">
          <img src="/logo-CAES.png" alt="Logo CAES" className="h-full w-full scale-[1.35] object-cover" />
        </div>

        <p className="text-xs font-semibold uppercase tracking-widest text-blue-700 mb-2">
          UNIJUÍ • Engenharia de Software
        </p>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Bem-vindo à plataforma do Centro Acadêmico
        </h1>

        <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed max-w-lg mx-auto">
          Acesse para adquirir os produtos oficiais do curso, acompanhar o status dos seus pedidos e verificar os locais de retirada presencial.
        </p>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-8 text-left">
          <div className="p-4 rounded-2xl bg-white/80 border border-slate-200/80 shadow-xs">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-2.5">
              <ShoppingBag size={18} />
            </div>
            <h3 className="text-xs font-semibold text-slate-900">Produtos Oficiais</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Kits, camisetas e acessórios do curso.</p>
          </div>

          <div className="p-4 rounded-2xl bg-white/80 border border-slate-200/80 shadow-xs">
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center mb-2.5">
              <PackageCheck size={18} />
            </div>
            <h3 className="text-xs font-semibold text-slate-900">Retirada Fácil</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Acompanhe lotes e horários de entrega.</p>
          </div>

          <div className="p-4 rounded-2xl bg-white/80 border border-slate-200/80 shadow-xs">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-2.5">
              <ShieldCheck size={18} />
            </div>
            <h3 className="text-xs font-semibold text-slate-900">Acesso Restrito</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Login com e-mail institucional.</p>
          </div>
        </div>

        {/* Login CTA */}
        <div className="flex flex-col items-center gap-3">
          <GoogleButton
            onClick={handleLogin}
            isLoading={isRedirecting}
            className="w-full sm:w-auto"
          />

          <p className="text-xs text-slate-400">
            Disponível para estudantes e professores com e-mail institucional da UNIJUÍ.
          </p>
        </div>
      </div>
    </div>
  );
};


