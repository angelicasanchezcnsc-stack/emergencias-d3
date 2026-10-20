// Contenido inicial del aplicativo. Todo es editable desde la app.
// Fuente: Plan de Preparación y Respuesta ante Emergencias y Contingencias, sede
// Calle 96 (CNSC, junio de 2024). Solo hay líneas institucionales y texto de
// protocolos: ningún nombre ni celular de personas (el repositorio es público).

const NOTA_PLAN = 'Tomado del plan de emergencias de la sede (2024). Confirme que sigue vigente.';
const NOTA_FALTA = 'Ejemplo: aún no se recibe este dato del Área de Seguridad y Salud en el Trabajo. Edítelo cuando llegue.';

const linea = (id, grupo, nombre, telefono, nota = NOTA_PLAN) =>
  ({ id, grupo, nombre, telefono, nota, pendiente: false, verificar: true });
const falta = (id, grupo, nombre, nota = NOTA_FALTA) =>
  ({ id, grupo, nombre, telefono: '', nota, pendiente: true, verificar: false });

export const contactosIniciales = () => ({
  contactos: [
    linea('c-123', 'Líneas de emergencia', 'Línea de emergencias (CAD)', '123'),
    linea('c-gaula', 'Líneas de emergencia', 'GAULA (secuestro y extorsión)', '165'),
    linea('c-antiterrorista', 'Líneas de emergencia', 'Línea antiterrorista de la Policía', '01 8000 91 96 21'),
    linea('c-policia', 'Líneas de emergencia', 'Policía (línea directa)', '01 8000 91 06 00'),
    linea('c-bomberos', 'Líneas de emergencia', 'Bomberos voluntarios de Cundinamarca', '311 482 8992',
      'El plan lista este número de Cundinamarca. Verifique cuál es la línea de bomberos para Bogotá.'),
    linea('c-defensa-24', 'Líneas de emergencia', 'Defensa Civil (24 horas)', '640 0090'),
    linea('c-defensa-134', 'Líneas de emergencia', 'Defensa Civil Cundinamarca', '134'),
    linea('c-idiger', 'Líneas de emergencia', 'IDIGER (gestión del riesgo)', '429 28 00',
      'El plan escribe «IDEGER». Verifique el nombre y el teléfono.'),
    linea('c-fiscalia', 'Líneas de emergencia', 'Fiscalía (centro de comunicaciones)', '122'),

    linea('c-sst-5555', 'Seguridad y Salud en el Trabajo (CNSC)', 'Línea de Seguridad y Salud en el Trabajo', '5555',
      'El plan indica esta línea para reportar situaciones sospechosas.'),
    linea('c-conmutador', 'Seguridad y Salud en el Trabajo (CNSC)', 'Conmutador de la CNSC', '(601) 325 9700', 'Teléfono de la entidad según el plan.'),
    falta('c-sst-resp', 'Seguridad y Salud en el Trabajo (CNSC)', 'Responsable del SG-SST',
      'Pendiente: el plan de 2024 nombra a una persona; confirme quién es hoy y su contacto. ' + NOTA_FALTA),
    falta('c-evacuacion', 'Seguridad y Salud en el Trabajo (CNSC)', 'Coordinación del plan de evacuación del edificio',
      'Pendiente: el plan de 2024 nombra a una persona; confirme quién es hoy y su contacto. ' + NOTA_FALTA),
    falta('c-arl', 'Seguridad y Salud en el Trabajo (CNSC)', 'ARL de la CNSC (línea de atención)'),

    falta('c-edificio', 'Edificio', 'Administración del edificio'),
    falta('c-vigilancia', 'Edificio', 'Vigilancia (seguridad física)')
  ]
});

export const rutasIniciales = () => ({
  punto: {
    titulo: 'Punto de encuentro principal',
    direccion: 'Diagonal 92 / Calle 97',
    indicaciones: 'Salga del edificio por la ruta de evacuación señalizada y siga la línea verde del mapa hasta el punto de encuentro. ' +
      'Una vez allí, repórtese con su brigadista y espere instrucciones. No regrese al edificio hasta que lo autoricen.',
    verificar: true,
    notaVerificar: 'La dirección del plan (Diagonal 92 / Calle 97) no coincide del todo con las calles que rotula el mapa. Confírmela con el Área de Seguridad y Salud en el Trabajo.'
  },
  general: 'El edificio tiene una sola ruta de evacuación: la escalera interna. Descienda hasta el primer piso sin correr y sin usar el celular, ' +
    'y salga por la ruta señalizada. Nunca use los ascensores. Lleve consigo a sus visitantes y no se devuelva por ningún motivo.',
  pisos: {}
});

const P = (id, titulo, secciones) => ({ id, titulo, secciones: secciones.map(([t, items]) => ({ titulo: t, items })) });

export const recomendacionesIniciales = () => ({
  protocolos: [
    P('evacuacion', 'Protocolo general de evacuación', [
      ['Pasos', [
        'Espere la señal de alarma o la orden de los brigadistas.',
        'Desplácese en fila y ordenadamente hasta el punto de escaleras señalizado en el piso, siguiendo la ruta indicada; lleve siempre a sus visitantes.',
        'Descienda por las escaleras hasta el primer piso; no corra, no use dispositivos móviles y no genere pánico ni comentarios.',
        'Salga de las instalaciones ordenadamente por la ruta de evacuación definida y señalizada.'
      ]]
    ]),
    P('sismo', 'Movimiento sísmico', [
      ['Antes', [
        'Realice un mantenimiento adecuado en las instalaciones físicas de su puesto de trabajo.',
        'Asegure o reubique objetos que se puedan caer o proyectar, como lámparas, estanterías o gabinetes, entre otros. Nunca almacene elementos sobre su puesto de trabajo.',
        'Mantenga reserva de agua y un pito en su puesto de trabajo, a la mano.',
        'Conozca los mecanismos para suspender el suministro de energía eléctrica y su ubicación.',
        'Practique simulacros de evacuación para este evento.',
        'Mantenga, en lo posible, cerradas las cortinas o persianas; evite así la proyección de vidrios en caso de rompimiento.',
        'Planee sus sitios de refugio, por medio de los puntos identificados como áreas de seguridad o resguardo en caso de sismo.'
      ]],
      ['Durante', [
        'No genere pánico, no grite, no se altere.',
        'Aléjese de ventanas, lámparas, ductos de aire, estanterías y demás objetos que puedan caer.',
        'No intente evacuar por desesperante que parezca la situación; conserve la calma.',
        'No salga corriendo; mantenga la calma y ubíquese en el punto seguro identificado.',
        'Refúgiese en muebles resistentes, preferiblemente a un costado de ellos y en posición fetal, para formar el triángulo de la vida y aumentar así la posibilidad de supervivencia ante el evento.',
        'Acate las instrucciones que se le impartan.'
      ]],
      ['Después', [
        'Siga el protocolo de evacuación dado al inicio de este plan.',
        'Evite aglomeraciones en las puertas de salida.',
        'Apague los equipos, maquinaria y sistemas antes de salir.',
        'Use las escaleras para evacuar; nunca utilice los ascensores.',
        'Si usa calzado de tacón, quíteselo para evitar lesiones al desplazarse si existe colapso de estructuras.',
        'Revise el estado de vigas, columnas o elementos no estructurales en su área.',
        'Esté alerta y aléjese de estructuras que se puedan derrumbar.',
        'Si queda atrapado, use una señal visible o sonora para llamar la atención (use el pito).',
        'Si es posible, suspenda el suministro de energía eléctrica y de gas.',
        'No utilice el agua de la tubería de la red distrital, ya que puede estar contaminada; utilice su agua de reserva.',
        'Si está atrapado y planea encender fósforos o una vela, no lo haga en lugares donde haya olor a gas o combustible, ni en espacios confinados, ya que ese fuego consumirá el oxígeno disponible.',
        'No pise escombros y, si requiere moverlos, sea muy cuidadoso.',
        'Vaya al punto de encuentro y espere las órdenes de los equipos de socorro o del comité de emergencias.',
        'Informe cualquier anomalía.'
      ]]
    ]),
    P('incendio', 'Incendio o explosión', [
      ['Antes', [
        'Conocer y respetar las normas para prevención de incendios.',
        'Conocer la ubicación de los extintores y aprender su uso correcto.',
        'No fumar en áreas no autorizadas.',
        'Evite sobrecargar los tomacorrientes.',
        'Evite la acumulación de papeles o basura cerca de fuentes lumínicas o de sitios donde se pueda originar un conato de incendio.',
        'Antes de salir, cerciórese de que nada haya quedado encendido.',
        'Mantenga los corredores, salidas y escaleras libres de obstáculos, al igual que los extintores; nunca cuelgue nada sobre estos.',
        'Verifique que el sistema de rociadores contra incendio (sprinklers) se mantenga en buen estado.'
      ]],
      ['Durante', [
        'Si detecta humo, informe inmediatamente al personal de seguridad física de la institución o a la brigada.',
        'Los detectores de humo se activarán y sonará la alarma contra incendios.',
        'El sistema de rociadores contra incendio se activará automáticamente en presencia de calor en el área afectada.',
        'Si no sabe utilizar el extintor o los gabinetes contra incendio, evacue la zona de forma inmediata.',
        'La brigada de emergencia se encargará de retirar los objetos que sirvan de combustible al fuego.',
        'Evite el pánico; no corra ni cause confusión; no grite.',
        'Utilice las escaleras; nunca el ascensor si se encuentra en niveles superiores.',
        'No se quede en baños, cocinas o zonas de descanso, ya que puede quedar atrapado.',
        'Si el lugar está lleno de humo, salga agachado o en arrastre a nivel del suelo, cubriéndose la nariz y la boca con un pañuelo húmedo si es posible (si sospecha que en el ambiente hay cloro, no se proteja con nada húmedo).',
        'Si su ropa se incendia, no corra: arrójese al suelo y dé vueltas sobre su cuerpo.',
        'No salte desde los pisos superiores.',
        'Si encuentra una puerta cerrada, tóquela con el dorso de la mano; si está caliente, no la abra, pues indica una elevada temperatura al interior del recinto, y busque otra salida.',
        'Si queda atrapado, deje una señal con su ropa o con elementos que lo hagan visible cuando ingresen los grupos de rescate.'
      ]],
      ['Después', [
        'Reúnase con sus compañeros en el punto de encuentro.',
        'No regrese al lugar del incendio ni se retire del punto de encuentro hasta que lo autoricen los bomberos o el comité de emergencias.',
        'Informe al coordinador de evacuación sobre personas lesionadas o la ausencia de algún compañero, indicando cuándo y dónde lo vio por última vez.',
        'Atienda las indicaciones de los brigadistas, de los coordinadores de evacuación y de los grupos de apoyo.'
      ]]
    ]),
    P('estructural', 'Fallas estructurales (colapso estructural o no estructural)', [
      ['Antes', [
        'Realice una verificación de las instalaciones físicas de la institución desde su puesto de trabajo.',
        'Asegure o reubique objetos que se puedan caer o proyectar, como lámparas, estanterías o gabinetes, entre otros. Nunca almacene elementos sobre su puesto de trabajo.',
        'Conozca los mecanismos para suspender el suministro de energía eléctrica y su ubicación.',
        'Participe en los simulacros de evacuación que se realizan periódicamente para este evento.',
        'Planee sus sitios de refugio en caso de quedar atrapado (identifique zonas seguras).',
        'Mantenga siempre con usted un silbato de plástico para emitir señales sonoras si queda atrapado.'
      ]],
      ['Durante', [
        'Esté alerta y aléjese de estructuras que se puedan derrumbar.',
        'No salga corriendo; mantenga la calma.',
        'Suspenda el suministro de energía eléctrica, de gas o de otra fuente de energía.',
        'Apague los equipos, maquinaria y sistemas antes de salir, si es posible.',
        'Aléjese de ventanas, lámparas, ductos de aire, estanterías y demás objetos que puedan caer o golpearlo.',
        'Use las escaleras para evacuar.',
        'Evite aglomeraciones en las puertas de salida; siga las rutas de evacuación.',
        'Acate las instrucciones que le impartan los brigadistas.',
        'No se devuelva por ningún motivo; está completamente prohibido. Si observa que alguien lo hace, comuníquelo al brigadista.',
        'Si está atrapado y planea encender fósforos o una vela, no lo haga en lugares donde haya olor a gas o combustible, ni en espacios confinados, ya que ese fuego consumirá el oxígeno disponible.'
      ]],
      ['Después', [
        'Si queda atrapado, use una señal visible o sonora para llamar la atención.',
        'Suspenda el suministro de energía eléctrica, de gas o de otra fuente de energía, si es posible.',
        'Vaya al punto de encuentro y espere las órdenes de los equipos de socorro o del líder de brigada.',
        'Informe cualquier anomalía.'
      ]]
    ]),
    P('riesgo-publico', 'Riesgo público (desórdenes civiles)', [
      ['Antes', [
        'Prepárese sobre cómo actuar frente a un evento de esta categoría (jornadas de capacitación).',
        'Manténgase alerta.',
        'Infórmese por noticias radiales si hay algún tipo de manifestación en áreas cercanas a la instalación.'
      ]],
      ['Durante', [
        'El personal de vigilancia reforzará la vigilancia en los puntos críticos.',
        'Los vigilantes deben cerrar las puertas y rejas de protección, y mantener estricto control sobre las personas que ingresan.',
        'Si evidencia alguna manifestación, comuníquese con las entidades de vigilancia u orden público e informe de la situación.',
        'Intente llamar a sus familiares para informarlos, pero sea enfático en que no se trasladen hasta el sitio de los hechos.',
        'Aléjese de la multitud.',
        'Tranquilice a las personas que estén a su alrededor.',
        'Evite acercarse a las manifestaciones; pueden agredirle.',
        'Aléjese de puertas y ventanas que den a la calle.',
        'En caso de evacuación, actúe según el procedimiento establecido; salga calmada y ordenadamente del lugar.',
        'Evite gritar y fomentar la violencia; si es posible, ayude a controlar los brotes de violencia.',
        'Evite el pánico.'
      ]],
      ['Después, si evacúa', [
        'Siga el protocolo de evacuación dado al inicio de este plan.',
        'Reúnase con sus compañeros en el punto de encuentro.',
        'No regrese a las instalaciones hasta que lo autorice el comité de emergencias o las autoridades competentes.',
        'Informe al coordinador de evacuación sobre personas lesionadas o la ausencia de algún compañero.',
        'Atienda las indicaciones de los brigadistas, los coordinadores de evacuación y los grupos de apoyo.',
        'Espere el llamado de lista por parte de la brigada de emergencias.'
      ]],
      ['Después, si no evacúa', [
        'No salga del lugar hasta que haya terminado el desorden civil.',
        'Informe a su jefe inmediato el estado de salud suyo y de sus compañeros.',
        'Al salir de las instalaciones, hágalo en forma segura, buscando lugares de refugio si se llegase a presentar nuevamente el desorden civil.',
        'Comuníquese con un familiar, pero evite alarmarlo, ya que podría ponerlo en riesgo si se presenta en el lugar para saber cómo se encuentra usted.'
      ]]
    ]),
    P('atentado', 'Atentado terrorista', [
      ['Antes', [
        'Prepárese en las acciones que se deben seguir si se llegase a presentar la situación.',
        'Realice simulacros, fortaleciendo las salidas y rutas de evacuación.',
        'Contacte a las fuerzas de orden público y, en lo posible, establezca con ellas protocolos de acción ante un eventual atentado en el perímetro de la institución.'
      ]],
      ['Durante, si sospecha de una situación', [
        'Si descubre elementos sospechosos o encuentra personas con comportamientos extraños e inusuales, notifique a su jefe inmediato, a la Línea 5555 de seguridad y salud en el trabajo, y al personal de seguridad física, quien activará de inmediato el plan de evacuación por sospecha y hará enlace con las fuerzas de orden público.',
        'Siga el protocolo de evacuación.',
        'Comunique inmediatamente a los grupos de apoyo y a la fuerza pública.',
        'No mueva ningún material sospechoso.',
        'Espere indicaciones de los grupos de emergencia y de las autoridades.',
        'Lleve con usted a sus visitantes.',
        'Vaya al sitio de reunión establecido y espere instrucciones del coordinador del área.'
      ]],
      ['Durante, si recibe una llamada de amenaza', [
        'Prolongue el tiempo de la conversación.',
        'Si tiene un mecanismo de grabación, actívelo.',
        'Si puede establecer intercomunicación, hágalo con el líder de brigada.',
        'Procure obtener información como: quién llama, desde dónde llama, tipo de amenaza, cuándo y dónde sucederá, y por qué lo está haciendo.',
        'Trate de captar detalles significativos: voz, ruidos de fondo, acentos, modismos, nombres, frases repetitivas.',
        'No cuelgue hasta asegurarse de que la persona que llamó lo ha hecho.',
        'No comente el hecho a nadie ni suministre información a personas ajenas al grupo de emergencias o a las autoridades competentes; hágalo de inmediato y sin generar pánico.'
      ]],
      ['Después', [
        'Reúnase con sus compañeros en el punto de encuentro.',
        'No regrese a las instalaciones hasta que lo autoricen las autoridades competentes.',
        'Informe al coordinador de evacuación sobre personas lesionadas o la ausencia de algún compañero.',
        'Atienda las indicaciones de los brigadistas o de los grupos de apoyo.'
      ]]
    ]),
    P('asalto', 'Asaltos o robos', [
      ['Antes', [
        'Disponga de sitios estratégicos para guardar objetos de valor.',
        'Si maneja grandes cantidades de dinero, realice arqueos de caja a diferentes horas del día y deposítelos en un lugar seguro que solo usted conozca.',
        'Si va solo, no porte objetos de valor vistosos (anillos, cadenas, etc.).',
        'Solicite comunicados o información al personal de vigilancia privada.'
      ]],
      ['Durante', [
        'Conserve la calma y no grite; recuerde que el asaltante suele estar más tenso y asustado que usted, y cualquier movimiento suyo podría desencadenar una situación lamentable.',
        'Observe los rasgos más destacados del asaltante, en particular zapatos y pantalones.',
        'No toque nada en el área del atraco, para no entorpecer la obtención de huellas.',
        'Obedezca las indicaciones del asaltante, de manera lenta y calmada.',
        'No se enfrente al asaltante, especialmente si está armado.'
      ]],
      ['Después', [
        'Reporte el evento directamente a las entidades y autoridades competentes.',
        'Si fue agredido por el asaltante, trasládese en el menor tiempo posible a un centro asistencial.',
        'Informe a la institución sobre su estado de salud y sobre lo ocurrido.'
      ]]
    ])
  ]
});

// ---------- Autorización de tratamiento de datos (caracterización individual) ----------
// Texto estándar basado en la Ley 1581 de 2012 y el Decreto 1377 de 2013 (compilado en el
// Decreto 1074 de 2015). Es un borrador: debe revisarlo el área jurídica o el oficial de
// protección de datos de la CNSC. El administrador puede editarlo; cada cambio sube la versión
// y cada persona debe volver a aceptar.
// v2 (v0.12): agrega el párrafo sobre el contacto de emergencia del registro del área de personal, que va
// aparte de la caracterización. En una instalación que ya guardó su texto, el administrador lo aplica desde
// Caracterizaciones → «Editar texto de la autorización» (sube la versión y cada persona vuelve a aceptar).
export const consentimientoInicial = () => ({
  version: 'v2',
  texto: [
    'AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES Y SENSIBLES: CARACTERIZACIÓN PARA EMERGENCIAS',
    'Responsable del tratamiento: Comisión Nacional del Servicio Civil (CNSC), a través del Despacho del Comisionado Edwin Arturo Ruiz Moreno (Despacho 3). Dirección: Carrera 16 No. 96-64, Bogotá D. C. Política de tratamiento de datos personales de la CNSC: https://www.cnsc.gov.co/politica-de-privacidad-y-proteccion-de-datos-personales',
    'Finalidad: identificar qué apoyo puede necesitar usted para evacuar de forma segura, contactar a la persona que usted indique y orientar a la brigada y a la coordinación de emergencias del Despacho 3 durante una emergencia o un simulacro. Sus datos no se usan para ninguna otra finalidad, ni para evaluar su desempeño ni para decisiones laborales.',
    'Datos que se recolectan: nombre, parentesco y teléfono de su contacto de emergencia; categoría de condición relevante para la evacuación (movilidad reducida, salud con manejo por horario, embarazo, alergia grave u otra); una nota operativa breve; el apoyo que necesita para evacuar; y observaciones. Algunos de estos datos son sensibles porque se refieren a su salud.',
    'Carácter facultativo: usted no está obligado a autorizar el tratamiento de datos sensibles ni a responder preguntas sobre ellos. No diligenciar este formulario no tiene ninguna consecuencia laboral ni contractual. Procure no escribir diagnósticos: describa solo qué ayuda necesita.',
    'Quién puede ver sus datos: usted; el administrador del aplicativo y la coordinación de emergencias del Despacho (coordinador y suplente) pueden ver el detalle completo; los brigadistas de su piso solo ven, durante una emergencia o un simulacro, que usted requiere apoyo, de qué tipo y la persona que haya designado como acompañante; esa persona acompañante ve la misma información mínima.',
    'Medidas de seguridad: la información se cifra en su dispositivo antes de guardarse y solo puede abrirse con las llaves de las personas autorizadas. No se almacena en claro en servidores de terceros.',
    'Sus derechos como titular: conocer, actualizar y rectificar sus datos; solicitar prueba de esta autorización; ser informado sobre el uso que se les ha dado; presentar quejas ante la Superintendencia de Industria y Comercio; revocar la autorización y solicitar la supresión de sus datos. Puede ver, modificar o borrar toda su información en cualquier momento desde este mismo aplicativo (opción «Revocar mi autorización y borrar mis datos»). Canal adicional para ejercer sus derechos: el indicado en la política de tratamiento de datos de la CNSC.',
    'Conservación: sus datos se conservan mientras usted haga parte del Despacho 3 o hasta que revoque su autorización; al retirarse del Despacho se borran.',
    'Datos de terceros: declaro que la persona cuyo nombre y teléfono registro como contacto de emergencia fue informada de que sus datos serán usados únicamente para avisarle en caso de emergencia.',
    'Contacto de emergencia del registro de personal: aparte de esta caracterización, la coordinación carga desde el registro del área de personal su teléfono, el nombre, el parentesco y el teléfono de un familiar, su EPS y su ARL. El registro de personal es independiente de esta autorización y su tratamiento se explica en el aviso de privacidad del contacto de emergencia, que puede consultar en esta misma pantalla.'
  ].join('\n\n')
});

// ---------- Aviso de privacidad del contacto de emergencia (v0.12) ----------
// Informa a cada persona sobre el contacto de emergencia que carga la coordinación desde el registro del área
// de personal. BORRADOR: debe revisarlo el área jurídica o el oficial de protección de datos de la CNSC, que
// también debe confirmar con el área de personal la autorización para usar estos datos en emergencias.
// Se muestra en Mi caracterización y en la carga de contactos; su resumen va en las fichas de verificación.
export const AVISO_CONTACTOS = {
  version: 'borrador 1 (20/10/2026)',
  texto: [
    'AVISO DE PRIVACIDAD: CONTACTO DE EMERGENCIA',
    'Responsable del tratamiento: Comisión Nacional del Servicio Civil (CNSC), a través del Despacho del Comisionado Edwin Arturo Ruiz Moreno (Despacho 3). Dirección: Carrera 16 No. 96-64, Bogotá D. C. Política de tratamiento de datos personales de la CNSC: https://www.cnsc.gov.co/politica-de-privacidad-y-proteccion-de-datos-personales',
    'Datos y origen: su teléfono; el nombre, el parentesco y el teléfono de un familiar; su EPS y su ARL. La coordinación del Despacho los toma del registro del área de personal de la CNSC. Usted puede pedir que se corrijan en cualquier momento.',
    'Finalidad: comunicarse con usted o con su familiar durante una emergencia o un simulacro, en especial si no se le ubica o necesita apoyo para evacuar; y, si resulta herido, remitirlo a su EPS y reportar el accidente a su ARL. Los datos se usan únicamente para estas finalidades.',
    'Quién los ve: el administrador del aplicativo, el coordinador y el suplente de emergencias del Despacho. Los brigadistas de su piso solo los ven durante una emergencia o un simulacro, y solo si usted queda marcado como no ubicado, con necesidad de apoyo o de asistencia. Un brigadista de otro piso puede consultarlos durante la emergencia, y esa consulta queda registrada. La EPS y la ARL solo llegan al celular de un brigadista mientras dura la emergencia y se borran al terminar.',
    'Medidas de seguridad: los datos se cifran en el computador o en el celular de quien los carga, antes de guardarse. Google, donde funciona el servidor del aplicativo, solo guarda texto ilegible. Los celulares de la coordinación y de los brigadistas conservan una copia cifrada para poder usarla sin internet.',
    'Conservación: los datos se conservan mientras usted haga parte del Despacho 3 y se borran cuando se retira. Una vez al año la coordinación le entrega una ficha para que confirme o corrija su contacto.',
    'Datos de su familiar: su familiar es un tercero. Sus datos se usan solo para avisarle en caso de emergencia. Le pedimos informarle que su nombre y su teléfono están registrados para esa finalidad.',
    'Sus derechos como titular: conocer, actualizar y rectificar sus datos; ser informado sobre el uso que se les ha dado; solicitar su supresión cuando no exista un deber legal de conservarlos; y presentar quejas ante la Superintendencia de Industria y Comercio. Puede ver y corregir su contacto en «Mi caracterización» si tiene acceso al aplicativo, o pedirlo a la coordinación del Despacho. Canal adicional: el indicado en la política de tratamiento de datos de la CNSC.'
  ].join('\n\n')
};

// Resumen del aviso para las fichas impresas de verificación (quien no tiene acceso al aplicativo se entera por ahí).
export const AVISO_CONTACTOS_CORTO = 'Para qué se usa: para avisar a su familiar y, si resulta herido, remitirlo a su EPS o reportar el accidente a su ARL durante una emergencia. Quién lo ve: la coordinación del Despacho y, durante una emergencia o un simulacro, los brigadistas cuando usted no esté ubicado o necesite apoyo. Va cifrado y se borra cuando usted se retira del Despacho. Puede pedir a la coordinación que lo corrija, y también conocer el aviso de privacidad completo y ejercer sus derechos (Ley 1581 de 2012).';

// ---------- Protocolos individuales (derivados de la caracterización) ----------
// Texto general y prudente. Debe revisarlo el Área de Seguridad y Salud en el Trabajo.
const PI = (id, titulo, secciones) => P(id, 'Protocolo individual: ' + titulo, secciones);
const REVISAR = 'Este protocolo es una guía general: revíselo con el Área de Seguridad y Salud en el Trabajo y con su médico si es necesario.';

export const PROTOCOLOS_INDIVIDUALES = () => [
  PI('ind-movilidad', 'movilidad reducida', [
    ['Antes', [
      REVISAR,
      'Acuerde con la coordinación y con su brigadista la ruta alternativa y quién la acompañará. Puede registrar un acompañante en su caracterización.',
      'Mantenga a la mano su celular cargado y el pito de su puesto.',
      'Conozca de antemano un lugar seguro donde esperar ayuda si no puede bajar las escaleras.'
    ]],
    ['Durante', [
      'Avise de inmediato a su brigadista o a su acompañante, o use «Necesito ayuda» en el aplicativo.',
      'No use los ascensores.',
      'No intente bajar sola o solo por las escaleras si no es seguro para usted: espere ayuda en el lugar seguro acordado, lejos de ventanas.',
      'Si queda atrapada o atrapado, use el pito y diga su ubicación exacta.'
    ]],
    ['Después', [
      'Repórtese con su brigadista en el punto de encuentro y espere las indicaciones de los equipos de socorro.'
    ]]
  ]),
  PI('ind-salud', 'salud con manejo por horario', [
    ['Antes', [
      REVISAR,
      'Si su médico lo indica, tenga en su puesto lo necesario para varias horas de manejo y un lugar donde pueda llevarlo con usted al evacuar.',
      'Registre en su caracterización a quién avisar si la emergencia se prolonga.'
    ]],
    ['Durante', [
      'Evacúe con calma llevando lo esencial, si es posible.',
      'Avise a su brigadista si siente algún malestar.'
    ]],
    ['Después', [
      'Si la emergencia se prolonga, avise a su brigadista o a la coordinación que debe retomar su manejo en un horario fijo; no necesita dar detalles médicos.'
    ]]
  ]),
  PI('ind-embarazo', 'embarazo', [
    ['Antes', [REVISAR, 'Avise a su brigadista y a la coordinación para que la tengan presente en la evacuación.']],
    ['Durante', [
      'Evacúe con calma, sin correr y sin empujar; use el pasamanos de la escalera.',
      'Si lo necesita, pida apoyo a su brigadista o a su acompañante.',
      'No use los ascensores.'
    ]],
    ['Después', ['Repórtese en el punto de encuentro y avise de inmediato si siente cualquier molestia.']]
  ]),
  PI('ind-alergia', 'alergia grave', [
    ['Antes', [
      REVISAR,
      'Tenga a la mano, en su puesto, el medicamento de emergencia que le haya indicado su médico.'
    ]],
    ['Durante', [
      'Lleve consigo su medicamento al evacuar, si es posible.',
      'Avise a su brigadista si hay humo, polvo o sustancias que puedan afectarla o afectarlo.'
    ]],
    ['Después', ['Si presenta síntomas, avise de inmediato a los brigadistas y llame al 123.']]
  ]),
  PI('ind-otra', 'otra condición o apoyo', [
    ['Antes', [REVISAR, 'Hable con la coordinación del Despacho para acordar cómo la o lo ayudarán a evacuar.']],
    ['Durante', ['Avise a su brigadista o a su acompañante lo que necesita, o use «Necesito ayuda» en el aplicativo.']],
    ['Después', ['Repórtese con su brigadista en el punto de encuentro.']]
  ])
];

// Espacios para archivos que el administrador carga desde la app.
export const ARCHIVOS = [
  { id: 'punto', nombre: 'Mapa del punto de encuentro', tipo: 'imagen' },
  ...[2, 4, 6, 7].map(n => ({ id: 'ruta-' + n, nombre: `Ruta de evacuación, piso ${n}`, tipo: 'imagen', piso: n })),
  ...[2, 4, 6, 7].map(n => ({ id: 'plano-' + n, nombre: `Plano de planta con puestos, piso ${n}`, tipo: 'plano', piso: n }))
];
