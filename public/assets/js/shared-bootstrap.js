/* ============================================================
   shared-bootstrap.js — expõe o motor de cálculo ao front

   O módulo /shared/finance.js é o mesmo que o servidor usa para
   gravar os valores. Aqui ele é importado como ES module e
   publicado em window.Finance, porque os demais scripts da tela
   são clássicos.

   Ordem garantida pelo HTML: scripts type="module" são adiados e
   executam antes do DOMContentLoaded, que é quando app.js inicia.
   ============================================================ */

import Finance from '/shared/finance.js';

window.Finance = Finance;
