import type { IceAmountClass } from '../../scan/domain/iceAmount';

export type ThermalForecastInput = {
  currentWaterTempC: number;
  ambientTempC: number;
  volumeMl: number;
  iceAmount: IceAmountClass | null;
  /** Minutes since the current water-temperature measurement. */
  elapsedMinutes: number;
};

export type ThermalForecastStatus =
  | 'ready'
  | 'missing_input'
  | 'invalid_input';

export type ThermalForecast = {
  status: ThermalForecastStatus;
  projectedTemperatureC: number | null;
  temperatureRangeC: { low: number; high: number } | null;
  iceHoldMinutesRange: { low: number; high: number } | null;
  confidence: 'default' | 'assumption' | null;
  message: string;
};

export const THERMAL_FORECAST_HORIZON_MINUTES = 60;
export const THERMAL_FORECAST_GRAPH_HORIZON_MINUTES = 240;
export const THERMAL_FORECAST_GRAPH_POINTS_MINUTES =
  [0, 30, 60, 120, 180, 240] as const;
export const DEFAULT_COOLING_COEFFICIENT_PER_HOUR = 0.12;

const WATER_HEAT_CAPACITY_J_PER_G_K = 4.186;
const ICE_LATENT_HEAT_J_PER_G = 334;
const ICE_TARGET_TEMPERATURE_C = 4;

/** Broad engineering ranges; these are not measured ice masses. */
const ICE_MASS_RANGE_G: Record<
  IceAmountClass,
  { min: number; max: number }
> = {
  none: { min: 0, max: 0 },
  few: { min: 20, max: 60 },
  many: { min: 60, max: 180 },
};

function projectedWithoutIce(
  startTemperatureC: number,
  ambientTemperatureC: number,
  minutes: number,
  coefficientPerHour: number,
): number {
  return (
    ambientTemperatureC +
    (startTemperatureC - ambientTemperatureC) *
      Math.exp(-coefficientPerHour * (minutes / 60))
  );
}

function iceHoldMinutes(
  volumeMl: number,
  ambientTemperatureC: number,
  coefficientPerHour: number,
  massG: number,
): number {
  if (massG <= 0) {
    return 0;
  }
  const heatCapacity = volumeMl * WATER_HEAT_CAPACITY_J_PER_G_K;
  const temperatureDifference = Math.max(
    1,
    Math.abs(ambientTemperatureC - ICE_TARGET_TEMPERATURE_C),
  );
  const heatGainPerHour =
    heatCapacity * coefficientPerHour * temperatureDifference;
  return (massG * ICE_LATENT_HEAT_J_PER_G * 60) / heatGainPerHour;
}

function projectedWithIce(
  input: ThermalForecastInput,
  minutesFromMeasurement: number,
  massG: number,
): number {
  const holdMinutes = iceHoldMinutes(
    input.volumeMl,
    input.ambientTempC,
    DEFAULT_COOLING_COEFFICIENT_PER_HOUR,
    massG,
  );
  const remainingHoldMinutes = Math.max(
    0,
    holdMinutes - input.elapsedMinutes,
  );
  const beforeIceExhaustion = Math.min(
    minutesFromMeasurement,
    remainingHoldMinutes,
  );
  const temperatureBeforeIceExhaustion = projectedWithoutIce(
    input.currentWaterTempC,
    input.ambientTempC,
    beforeIceExhaustion,
    DEFAULT_COOLING_COEFFICIENT_PER_HOUR,
  );
  if (input.currentWaterTempC > ICE_TARGET_TEMPERATURE_C) {
    // Do not claim that ice instantly cools warm water to 4C. Until a
    // calibrated phase-change model exists, use the conservative natural
    // cooling curve for water that starts above the ice-equilibrium target.
    return Math.max(
      ICE_TARGET_TEMPERATURE_C,
      projectedWithoutIce(
        input.currentWaterTempC,
        input.ambientTempC,
        minutesFromMeasurement,
        DEFAULT_COOLING_COEFFICIENT_PER_HOUR,
      ),
    );
  }
  if (minutesFromMeasurement <= remainingHoldMinutes) {
    return Math.min(temperatureBeforeIceExhaustion, ICE_TARGET_TEMPERATURE_C);
  }
  return projectedWithoutIce(
    Math.min(temperatureBeforeIceExhaustion, ICE_TARGET_TEMPERATURE_C),
    input.ambientTempC,
    minutesFromMeasurement - remainingHoldMinutes,
    DEFAULT_COOLING_COEFFICIENT_PER_HOUR,
  );
}

function roundedTemperature(value: number): number {
  return Math.round(value * 10) / 10;
}

function invalidForecast(message: string): ThermalForecast {
  return {
    status: 'invalid_input',
    projectedTemperatureC: null,
    temperatureRangeC: null,
    iceHoldMinutesRange: null,
    confidence: null,
    message,
  };
}

/**
 * Project ahead with a transparent Newton-style baseline. Unknown ice is shown
 * as a widened no-ice baseline so the assumption stays visible.
 */
export function forecastTemperature(
  input: Partial<ThermalForecastInput>,
  horizonMinutes = THERMAL_FORECAST_HORIZON_MINUTES,
): ThermalForecast {
  if (
    input.currentWaterTempC === undefined ||
    input.ambientTempC === undefined ||
    input.volumeMl === undefined ||
    input.elapsedMinutes === undefined
  ) {
    return {
      status: 'missing_input',
      projectedTemperatureC: null,
      temperatureRangeC: null,
      iceHoldMinutesRange: null,
      confidence: null,
      message: '現在の水温・周囲温度・経過時間を入力すると予測できます',
    };
  }

  const { currentWaterTempC, ambientTempC, volumeMl, elapsedMinutes } = input;
  if (
    !Number.isFinite(currentWaterTempC) ||
    !Number.isFinite(ambientTempC) ||
    !Number.isFinite(volumeMl) ||
    !Number.isFinite(elapsedMinutes)
  ) {
    return invalidForecast('温度・容量・経過時間は数値で入力してください');
  }
  if (currentWaterTempC < -20 || currentWaterTempC > 80) {
    return invalidForecast('現在の水温は-20〜80℃で入力してください');
  }
  if (ambientTempC < -40 || ambientTempC > 60) {
    return invalidForecast('周囲温度は-40〜60℃で入力してください');
  }
  if (volumeMl < 100 || volumeMl > 10_000) {
    return invalidForecast('水筒容量は100〜10000mLで設定してください');
  }
  if (elapsedMinutes < 0 || elapsedMinutes > 24 * 60) {
    return invalidForecast('経過時間は0〜1440分で入力してください');
  }
  if (
    !Number.isFinite(horizonMinutes) ||
    horizonMinutes < 0 ||
    horizonMinutes > THERMAL_FORECAST_GRAPH_HORIZON_MINUTES
  ) {
    return invalidForecast('予測時間は0〜240分で指定してください');
  }

  const baseProjection = projectedWithoutIce(
    currentWaterTempC,
    ambientTempC,
    horizonMinutes,
    DEFAULT_COOLING_COEFFICIENT_PER_HOUR,
  );
  const iceAmount = input.iceAmount ?? null;
  if (iceAmount === null) {
    return {
      status: 'ready',
      projectedTemperatureC: roundedTemperature(baseProjection),
      temperatureRangeC: {
        low: roundedTemperature(baseProjection - 2),
        high: roundedTemperature(baseProjection + 2),
      },
      iceHoldMinutesRange: { low: 0, high: 0 },
      confidence: 'assumption',
      message: '氷量未判定のため、氷なしを基準にした参考値です',
    };
  }

  const massRange = ICE_MASS_RANGE_G[iceAmount];
  const coolerProjection = projectedWithIce(
    { ...input, iceAmount } as ThermalForecastInput,
    horizonMinutes,
    massRange.max,
  );
  const warmerProjection = projectedWithIce(
    { ...input, iceAmount } as ThermalForecastInput,
    horizonMinutes,
    massRange.min,
  );
  const holdLow = iceHoldMinutes(
    volumeMl,
    ambientTempC,
    DEFAULT_COOLING_COEFFICIENT_PER_HOUR,
    massRange.min,
  );
  const holdHigh = iceHoldMinutes(
    volumeMl,
    ambientTempC,
    DEFAULT_COOLING_COEFFICIENT_PER_HOUR,
    massRange.max,
  );

  return {
    status: 'ready',
    projectedTemperatureC: roundedTemperature(
      (coolerProjection + warmerProjection) / 2,
    ),
    temperatureRangeC: {
      low: roundedTemperature(
        Math.min(coolerProjection, warmerProjection),
      ),
      high: roundedTemperature(
        Math.max(coolerProjection, warmerProjection),
      ),
    },
    iceHoldMinutesRange: {
      low: Math.round(Math.max(0, holdLow - elapsedMinutes)),
      high: Math.round(Math.max(0, holdHigh - elapsedMinutes)),
    },
    confidence: 'default',
    message: '標準係数と氷量クラスから計算した参考値です',
  };
}
