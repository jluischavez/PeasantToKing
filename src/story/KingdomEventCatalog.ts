import type { ConstructionType } from '../map/ConstructionMap';
import type { Objective, RealmContext } from '../simulation/KingdomEvents';
import { simulatedMsPerGameHour as hour } from '../simulation/GameTime.ts';

type Terms = { objective: Objective; reward: { gold: number; favor: number }; rejectFavor: number; expireFavor: number; hours: number };
export type KingdomEventDefinition = {
  key: string; title: string; type: 'petition' | 'development' | 'recognition';
  requirements: string; stories: readonly string[]; demanding: boolean; cooldownHours: number;
  eligible: (context: RealmContext) => boolean; terms: (context: RealmContext, variant: number) => Terms;
};

const budget = (context: RealmContext) => Math.max(0, context.gold - (context.tribute && !context.tribute.paid ? context.tribute.gold : 0));
const has = (context: RealmContext, building: ConstructionType) => (context.buildings[building] ?? 0) > 0;
const stable = (context: RealmContext) => context.foodCoverage >= 90 && context.waterCoverage >= 90;
const reward = (favor: number, gold = 0) => ({ gold, favor });
const request = (objective: Objective, favor: number, gold = 0): Terms =>
  ({ objective, reward: reward(favor, gold), rejectFavor: -2, expireFavor: -3, hours: 48 });
const development = (objective: Objective, favor: number, gold = 0): Terms =>
  ({ objective, reward: reward(favor, gold), rejectFavor: 0, expireFavor: 0, hours: 48 });

export const kingdomEventCatalog: readonly KingdomEventDefinition[] = [
  {
    key: 'royal-war', title: 'La guerra del rey', type: 'petition', demanding: true, cooldownHours: 96,
    requirements: 'Tesorería suficiente después de reservar el tributo y al menos 15 de favor.',
    stories: [
      'Un mensajero llega cubierto de polvo y pide agua antes de desenrollar el sello real. Su Majestad prepara una campaña contra un vecino que ha puesto en duda la calidad de sus caballos. La corte solicita una contribución. El herrero recuerda que el honor también necesita herraduras.',
      'La Corona reúne provisiones para una campaña lejana. El capitán del mensajero ha prometido una victoria rápida. El tesorero, que ya ha oído esa frase, pide que los asentamientos colaboren con una cantidad prudente de oro.',
    ],
    eligible: context => budget(context) >= 25 && context.favor >= 15,
    terms: (context, variant) => request({ kind: 'gold', target: Math.max(10,
      Math.min(context.rank === 'aldea' ? 30 : context.rank === 'pueblo' ? 65 : 100,
        Math.floor(budget(context) * (variant ? 0.15 : 0.12)))) }, 5),
  },
  {
    key: 'northern-famine', title: 'Hambruna en el norte', type: 'petition', demanding: true, cooldownHours: 96,
    requirements: 'Granja y comida de almacenes autorizados por encima de dos horas de consumo doméstico.',
    stories: [
      'Los molinos del norte han permanecido quietos después de una mala cosecha. Una delegación pide comida para sus aldeas. Traen sacos vacíos y una carta de agradecimiento escrita de antemano. Podéis ayudar, siempre que también quede cena en vuestras mesas.',
      'Una carreta del norte llega sin mercancía. Su conductor cuenta que las familias están repartiendo la última cosecha. La Corona agradecerá un envío de alimento desde vuestros almacenes. El carretero promete devolver los sacos, aunque no garantiza que sigan oliendo a pan.',
    ],
    eligible: context => has(context, 'farm') && context.food >= context.population * 5 + 30,
    terms: (context, variant) => request({ kind: 'delivery', product: 'food',
      target: Math.min(variant ? 50 : 40, Math.floor((context.food - context.population * 5) / 2)) }, 6),
  },
  {
    key: 'winter-wood', title: 'El invierno se acerca', type: 'petition', demanding: true, cooldownHours: 96,
    requirements: 'Campamento y al menos 45 de madera comercializable en almacenes.',
    stories: [
      'Una aldea vecina prepara sus tejados para el invierno y descubre que sus vigas restantes ya tienen dueño. Su representante ofrece oro por un envío de madera. Para demostrar seriedad ha traído un contrato, dos clavos y una bufanda demasiado larga.',
      'El carpintero de un pueblo cercano solicita madera antes de que empeore el tiempo. Su lista menciona tejados, puertas y un banco para el alcalde. Podéis entregar una parte de vuestras existencias a cambio de un pago y una buena palabra ante la Corona.',
    ],
    eligible: context => has(context, 'lumberjack') && context.wood >= 45,
    terms: (context, variant) => {
      const target = Math.min(variant ? 35 : 25, Math.floor(context.wood / 2));
      return request({ kind: 'delivery', product: 'wood', target }, 3, Math.floor(target * 0.55));
    },
  },
  {
    key: 'royal-visit', title: 'La visita del monarca', type: 'development', demanding: false, cooldownHours: 120,
    requirements: 'Belleza de al menos 20, felicidad de al menos 60 y comida y agua cubiertas.',
    stories: [
      'El rey anuncia una visita. El séquito desea encontrar calles cuidadas y vecinos contentos durante su estancia. El escribano recomienda limpiar también detrás de los carteles. Su Majestad tiene la incómoda costumbre de mirar por las ventanas.',
      'La ruta de la corte pasará por vuestro asentamiento. El heraldo pide que la buena impresión dure toda la visita. Los vecinos aceptan barrer la plaza, pero insisten en que el rey vea también cómo viven los días corrientes.',
    ],
    eligible: context => context.beauty >= 20 && context.happiness >= 60 && stable(context),
    terms: (context, variant) => development({ kind: 'wellbeing', target: (variant ? 5 : 4) * hour,
      happiness: 60, beauty: Math.max(20, Math.floor(context.beauty) - 3), food: 90, water: 90 }, 7),
  },
  {
    key: 'admired-roads', title: 'Un pueblo digno de admiración', type: 'development', demanding: true, cooldownHours: 96,
    requirements: 'Pueblo o Villa, caminos propios mejorables y recursos para dos mejoras.',
    stories: [
      'Un noble atraviesa el pueblo y pierde una bota en el barro. Promete hablar bien de vuestra administración si los próximos visitantes encuentran caminos más firmes. Ha pedido al escribano que la bota figure entre las pérdidas diplomáticas.',
      'La comitiva de una condesa se detiene ante un tramo de tierra. Su cochero propone mejorar varios caminos con los materiales que vuestro rango permite. La condesa añade que una rueda menos hundida sería una magnífica carta de presentación.',
    ],
    eligible: context => context.rank !== 'aldea' && ((context.upgradableRoads >= 2 && budget(context) >= 12 && context.wood >= 4)
      || (context.rank === 'villa' && context.gravelRoads >= 2 && budget(context) >= 40 && context.wood >= 8)),
    terms: (context, variant) => {
      const stone = context.rank === 'villa' && context.gravelRoads >= 2 && budget(context) >= 40 && context.wood >= 8
        && (variant === 1 || context.upgradableRoads < 2);
      return development({ kind: 'roads', level: stone ? 3 : 2,
        target: variant && budget(context) >= (stone ? 60 : 24) && context.wood >= (stone ? 12 : 6)
          && (stone ? context.gravelRoads : context.upgradableRoads) >= 3 ? 3 : 2 }, 5);
    },
  },
  {
    key: 'royal-whim', title: 'El capricho de la Corona', type: 'development', demanding: true, cooldownHours: 120,
    requirements: 'Presupuesto para una decoración desbloqueada y terreno construible.',
    stories: [
      'Su Majestad ha contemplado un dibujo de vuestro asentamiento y ha señalado un espacio vacío. Allí, dice, cabría algo digno de una visita real. El escribano sugiere una decoración permitida por vuestro rango antes de que el rey aprenda la palabra monumento.',
      'Llega una carta perfumada de la corte. El monarca desea un rincón hermoso donde descansar en una visita futura. El jardinero propone empezar por una obra de tamaño sensato. La carta no aclara quién llevará la merienda.',
    ],
    eligible: context => budget(context) >= 50 && context.decorationSpace.garden,
    terms: (context, variant) => {
      const building: ConstructionType = context.rank === 'villa' && context.decorationSpace.plaza && budget(context) >= 375 && variant
        ? 'plaza' : context.rank !== 'aldea' && context.decorationSpace.park && budget(context) >= 200 && variant ? 'park' : 'garden';
      return development({ kind: 'building', building, target: 1 }, building === 'garden' ? 3 : 6);
    },
  },
  {
    key: 'new-families', title: 'Una nueva oportunidad', type: 'development', demanding: false, cooldownHours: 96,
    requirements: 'Plazas residenciales conectadas, felicidad de al menos 55 y abastecimiento estable.',
    stories: [
      'Varias familias se detienen junto al camino real buscando un lugar donde empezar de nuevo. Preguntan por viviendas, comida y trabajo. Un niño pregunta por los charcos. Si el asentamiento crece y conserva su bienestar, la Corona reconocerá vuestra acogida.',
      'Un grupo de viajeros pregunta si quedan solares donde echar raíces. Traen herramientas, mantas y una gallina que parece dirigir la expedición. El encargo consiste en recibir habitantes nuevos y sostener sus condiciones de vida.',
    ],
    eligible: context => context.capacity - context.population >= 2 && context.happiness >= 55 && stable(context),
    terms: (context, variant) => development({ kind: 'growth', target: Math.min(context.capacity - context.population, variant ? 4 : 2),
      happiness: 60, holdMs: 2 * hour }, 5),
  },
  {
    key: 'peasant-pride', title: 'El orgullo de los campesinos', type: 'development', demanding: false, cooldownHours: 96,
    requirements: 'Mercado, pozo y felicidad de al menos 60.',
    stories: [
      'Los vecinos entregan una petición escrita con más cuidado que los libros del recaudador. Desean vivir contentos durante varios días corrientes, con suministros y servicios que funcionen. La Corona observará si el buen gobierno dura más que una inauguración.',
      'Una delegación de campesinos pide que se escuche a quienes levantaron las primeras cercas. Quieren un periodo de bienestar sostenido. El portavoz ha traído un discurso largo, aunque acepta abreviarlo si hay agua y cena para todos.',
    ],
    eligible: context => has(context, 'market') && has(context, 'well') && context.happiness >= 60,
    terms: (_context, variant) => development({ kind: 'wellbeing', target: (variant ? 6 : 4) * hour,
      happiness: 70, beauty: 0, food: 90, water: 90 }, 5),
  },
  {
    key: 'royal-merchants', title: 'Los mercaderes del reino', type: 'development', demanding: false, cooldownHours: 96,
    requirements: 'Casa de Comercio operativa, ruta exterior y producción del producto solicitado.',
    stories: [
      'Un gremio de mercaderes ofrece una prima por nuevos envíos al reino. El acuerdo se cumplirá mediante los viajes de vuestra Casa de Comercio. El notario insiste en contar las carretas que salgan desde ahora. Las que ya llegaron a destino no pueden volver a presentarse al cobro.',
      'Una comerciante abre su libro de pedidos y propone reservar sitio para vuestros próximos excedentes. La prima se añadirá a las ventas habituales cuando se alcance la cantidad pactada. Su ayudante vigila las cuentas con un entusiasmo poco común.',
    ],
    eligible: context => context.exteriorTrade && (has(context, 'lumberjack') || has(context, 'farm')),
    terms: (context, variant) => development({ kind: 'trade', product: has(context, 'lumberjack') && (!has(context, 'farm') || variant) ? 'wood' : 'food',
      target: variant ? 60 : 40 }, 0, variant ? 18 : 12),
  },
  {
    key: 'royal-loyalty', title: 'La Corona reconoce tu lealtad', type: 'recognition', demanding: false, cooldownHours: 144,
    requirements: 'Favor de al menos 70, tributo pagado en los últimos tres días y bienestar estable.',
    stories: [
      'El tesorero real ha encontrado vuestro nombre en la lista de pagos puntuales. Tras comprobarlo dos veces, el rey ordena una pequeña recompensa. El escribano aconseja guardar la carta. Una felicitación de la corte ocupa menos espacio que una deuda.',
      'Un sello dorado acompaña una nota de agradecimiento. La Corona reconoce un asentamiento estable que ha cumplido con sus tributos. El mensajero entrega una bolsa modesta y se alegra de que esta vez nadie tenga que perseguir al recaudador.',
    ],
    eligible: context => context.favor >= 70 && context.recentTribute && context.happiness >= 65 && stable(context),
    terms: (_context, variant) => ({ objective: { kind: 'reward', target: 1 },
      reward: reward(2, variant ? 20 : 15), rejectFavor: 0, expireFavor: 0, hours: 48 }),
  },
  {
    key: 'village-festival', title: 'La fiesta de la cosecha', type: 'development', demanding: false, cooldownHours: 96,
    requirements: 'Mercado, felicidad de al menos 55 y comida y agua cubiertas.',
    stories: [
      'Los vecinos proponen una pequeña fiesta con lo que cada familia pueda aportar. Piden que el buen ánimo y los servicios duren mientras llegan los visitantes. El músico ofrece tocar sin cobrar, con la condición de que nadie le pida la canción del recaudador.',
      'El mercado prepara una jornada para celebrar la cosecha. Los tenderos esperan encontrar hogares abastecidos y vecinos de buen humor durante toda la reunión. El panadero ha reservado un sitio para el representante de la Corona.',
    ],
    eligible: context => has(context, 'market') && context.happiness >= 55 && stable(context),
    terms: (_context, variant) => development({ kind: 'wellbeing', target: (variant ? 3 : 2) * hour,
      happiness: 60, beauty: 0, food: 90, water: 90 }, 2),
  },
];
