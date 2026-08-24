#!/usr/bin/env node
// Script helper para rodar o seed com ALLOW_DATABASE_RESET=true de forma multiplataforma
process.env.ALLOW_DATABASE_RESET = "true";

// Importa e executa o seed dinamicamente via tsx (registrado como loader)
import("./seed.js");
