-- La plantilla de fabrica, ahora con las marcas que entiende la hoja
-- (# titulo, ## seccion, --- raya, [[FIRMAS: ...]]). Sin ellas el
-- documento salia como una nota de bloc: correcto y feo, y un contrato
-- feo es un contrato que la gente no lee antes de firmar.
--
-- Sigue siendo BORRADOR. Lo que cambia es como se ve, no lo que dice: el
-- texto legal lo pone un abogado, y esto es el esqueleto para que tenga
-- donde escribir.
update contrato_plantillas
set cuerpo = $txt$
# Contrato individual de trabajo por tiempo {{TIPO_CONTRATO}}

BORRADOR. Este texto es un esqueleto para que lo revise y lo complete un abogado laboralista antes de firmar nada. No es asesoria legal.

---

Que celebran, por una parte, {{EMPRESA}}, a quien en lo sucesivo se le denominara "EL PATRON"; y por la otra, {{NOMBRE}}, a quien en lo sucesivo se le denominara "{{EL_LA}} {{TRABAJADOR}}", al tenor de las siguientes:

## Declaraciones

I. Declara EL PATRON tener su domicilio en {{LUGAR}} y requerir los servicios de {{EL_LA}} {{TRABAJADOR}}.

II. Declara {{EL_LA}} {{TRABAJADOR}} llamarse como ha quedado escrito, estar en pleno uso de sus facultades y tener la capacidad y los conocimientos necesarios para desempenar el puesto de {{PUESTO}}.

## Clausulas

PRIMERA. PUESTO. {{EL_LA}} {{TRABAJADOR}} se obliga a prestar sus servicios personales subordinados en el puesto de {{PUESTO}}.

SEGUNDA. DURACION. El presente contrato se celebra por tiempo {{TIPO_CONTRATO}}, iniciando la relacion de trabajo el {{FECHA_INGRESO}}.

TERCERA. JORNADA. La jornada sera: {{JORNADA}}.

CUARTA. DIAS DE DESCANSO. {{EL_LA}} {{TRABAJADOR}} disfrutara de los siguientes dias de descanso semanal: {{DIAS_DESCANSO}}, ademas de los dias de descanso obligatorio que senala la Ley Federal del Trabajo.

QUINTA. SALARIO. El salario sera de $ {{SALARIO_DIARIO}} diarios, que se pagara en los terminos y fechas que acuerden las partes conforme a la Ley.

SEXTA. LUGAR DE TRABAJO. Los servicios se prestaran en {{LUGAR}}.

SEPTIMA. CAPACITACION. {{EL_LA}} {{TRABAJADOR}} se obliga a recibir la capacitacion y el adiestramiento que corresponda.

OCTAVA. OBLIGACIONES. Ambas partes se sujetan a lo dispuesto por la Ley Federal del Trabajo en todo lo no previsto en este contrato.

## Lo que falta que agregue su abogado

- Confidencialidad y manejo de informacion del negocio
- Periodo de prueba, si aplica
- Reglamento interior de trabajo
- Aviso de privacidad y tratamiento de datos personales
- Manejo de valores y de efectivo
- Lo que corresponda al giro

---

Leido que fue por ambas partes y sabedoras de su contenido y alcance legal, lo firman en {{LUGAR}}, el dia {{FECHA_HOY}}.

[[FIRMAS: {{EMPRESA}} | {{NOMBRE}}]]
$txt$
where nombre like 'BORRADOR%';
