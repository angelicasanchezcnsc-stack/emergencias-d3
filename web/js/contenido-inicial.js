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
    linea('c-gaula', 'Líneas de emergencia', 'GAULA — secuestro y extorsión', '165'),
    linea('c-antiterrorista', 'Líneas de emergencia', 'Línea antiterrorista de la Policía', '01 8000 91 96 21'),
    linea('c-policia', 'Líneas de emergencia', 'Policía — línea directa', '01 8000 91 06 00'),
    linea('c-bomberos', 'Líneas de emergencia', 'Bomberos voluntarios de Cundinamarca', '311 482 8992',
      'El plan lista este número de Cundinamarca. Verifique cuál es la línea de bomberos para Bogotá.'),
    linea('c-defensa-24', 'Líneas de emergencia', 'Defensa Civil — 24 horas', '640 0090'),
    linea('c-defensa-134', 'Líneas de emergencia', 'Defensa Civil Cundinamarca', '134'),
    linea('c-idiger', 'Líneas de emergencia', 'IDIGER — gestión del riesgo', '429 28 00',
      'El plan escribe «IDEGER». Verifique el nombre y el teléfono.'),
    linea('c-fiscalia', 'Líneas de emergencia', 'Fiscalía — centro de comunicaciones', '122'),

    linea('c-sst-5555', 'Seguridad y Salud en el Trabajo (CNSC)', 'Línea de Seguridad y Salud en el Trabajo', '5555',
      'El plan indica esta línea para reportar situaciones sospechosas.'),
    linea('c-conmutador', 'Seguridad y Salud en el Trabajo (CNSC)', 'Conmutador de la CNSC', '(601) 325 9700', 'Teléfono de la entidad según el plan.'),
    falta('c-sst-resp', 'Seguridad y Salud en el Trabajo (CNSC)', 'Responsable del SG-SST',
      'Pendiente: el plan de 2024 nombra a una persona; confirme quién es hoy y su contacto. ' + NOTA_FALTA),
    falta('c-evacuacion', 'Seguridad y Salud en el Trabajo (CNSC)', 'Coordinación del plan de evacuación del edificio',
      'Pendiente: el plan de 2024 nombra a una persona; confirme quién es hoy y su contacto. ' + NOTA_FALTA),
    falta('c-arl', 'Seguridad y Salud en el Trabajo (CNSC)', 'ARL de la CNSC — línea de atención'),

    falta('c-edificio', 'Edificio', 'Administración del edificio'),
    falta('c-vigilancia', 'Edificio', 'Vigilancia — seguridad física')
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
      ['Después — si evacúa', [
        'Siga el protocolo de evacuación dado al inicio de este plan.',
        'Reúnase con sus compañeros en el punto de encuentro.',
        'No regrese a las instalaciones hasta que lo autorice el comité de emergencias o las autoridades competentes.',
        'Informe al coordinador de evacuación sobre personas lesionadas o la ausencia de algún compañero.',
        'Atienda las indicaciones de los brigadistas, los coordinadores de evacuación y los grupos de apoyo.',
        'Espere el llamado de lista por parte de la brigada de emergencias.'
      ]],
      ['Después — si no evacúa', [
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
      ['Durante — si sospecha de una situación', [
        'Si descubre elementos sospechosos o encuentra personas con comportamientos extraños e inusuales, notifique a su jefe inmediato, a la Línea 5555 de seguridad y salud en el trabajo, y al personal de seguridad física, quien activará de inmediato el plan de evacuación por sospecha y hará enlace con las fuerzas de orden público.',
        'Siga el protocolo de evacuación.',
        'Comunique inmediatamente a los grupos de apoyo y a la fuerza pública.',
        'No mueva ningún material sospechoso.',
        'Espere indicaciones de los grupos de emergencia y de las autoridades.',
        'Lleve con usted a sus visitantes.',
        'Vaya al sitio de reunión establecido y espere instrucciones del coordinador del área.'
      ]],
      ['Durante — si recibe una llamada de amenaza', [
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

// Espacios para archivos que el administrador carga desde la app.
export const ARCHIVOS = [
  { id: 'punto', nombre: 'Mapa del punto de encuentro', tipo: 'imagen' },
  ...[2, 4, 6, 7].map(n => ({ id: 'ruta-' + n, nombre: `Ruta de evacuación — piso ${n}`, tipo: 'imagen', piso: n })),
  ...[2, 4, 6, 7].map(n => ({ id: 'plano-' + n, nombre: `Plano de planta con puestos — piso ${n}`, tipo: 'plano', piso: n }))
];
