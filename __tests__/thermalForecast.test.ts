import {
  forecastTemperature,
  THERMAL_FORECAST_GRAPH_HORIZON_MINUTES,
  THERMAL_FORECAST_GRAPH_POINTS_MINUTES,
  THERMAL_FORECAST_HORIZON_MINUTES,
} from '../src/features/thermal/domain/thermalForecast';

describe('thermal forecast domain', () => {
  test('makes the unknown-ice assumption explicit', () => {
    const result = forecastTemperature({
      currentWaterTempC: 6,
      ambientTempC: 30,
      volumeMl: 500,
      elapsedMinutes: 0,
    });

    expect(result.status).toBe('ready');
    expect(result.confidence).toBe('assumption');
    expect(result.message).toContain('氷なしを基準');
  });

  test('projects no-ice water toward ambient temperature', () => {
    const result = forecastTemperature({
      currentWaterTempC: 6,
      ambientTempC: 30,
      volumeMl: 500,
      iceAmount: 'none',
      elapsedMinutes: 0,
    });

    expect(result.status).toBe('ready');
    expect(result.projectedTemperatureC).not.toBeNull();
    expect(result.projectedTemperatureC as number).toBeGreaterThan(6);
    expect(result.projectedTemperatureC as number).toBeLessThan(30);
    expect(result.temperatureRangeC?.low).toBe(
      result.temperatureRangeC?.high,
    );
  });

  test('does not instantly cool warm water to the ice target', () => {
    const result = forecastTemperature({
      currentWaterTempC: 20,
      ambientTempC: 30,
      volumeMl: 500,
      iceAmount: 'many',
      elapsedMinutes: 0,
    });

    expect(result.projectedTemperatureC).toBeGreaterThan(4);
    expect(result.temperatureRangeC?.low).toBeGreaterThan(4);
  });

  test('keeps a larger ice class cooler and reports a range', () => {
    const few = forecastTemperature({
      currentWaterTempC: 6,
      ambientTempC: 30,
      volumeMl: 500,
      iceAmount: 'few',
      elapsedMinutes: 0,
    });
    const many = forecastTemperature({
      currentWaterTempC: 6,
      ambientTempC: 30,
      volumeMl: 500,
      iceAmount: 'many',
      elapsedMinutes: 0,
    });

    expect(few.temperatureRangeC?.low).toBeLessThanOrEqual(
      few.temperatureRangeC?.high as number,
    );
    expect(many.temperatureRangeC?.high).toBeLessThanOrEqual(
      few.temperatureRangeC?.high as number,
    );
    expect(many.iceHoldMinutesRange?.high).toBeGreaterThan(
      few.iceHoldMinutesRange?.high as number,
    );
  });

  test('subtracts elapsed time from the remaining ice hold estimate', () => {
    const result = forecastTemperature({
      currentWaterTempC: 4,
      ambientTempC: 30,
      volumeMl: 500,
      iceAmount: 'many',
      elapsedMinutes: 30,
    });

    expect(result.iceHoldMinutesRange?.low).toBeGreaterThanOrEqual(0);
    expect(result.iceHoldMinutesRange?.high).toBeLessThan(
      forecastTemperature({
        currentWaterTempC: 4,
        ambientTempC: 30,
        volumeMl: 500,
        iceAmount: 'many',
        elapsedMinutes: 0,
      }).iceHoldMinutesRange?.high as number,
    );
  });

  test('rejects unsafe or impossible input ranges', () => {
    expect(
      forecastTemperature({
        currentWaterTempC: 6,
        ambientTempC: 30,
        volumeMl: 20,
        iceAmount: 'none',
        elapsedMinutes: 0,
      }).status,
    ).toBe('invalid_input');
    expect(
      forecastTemperature({
        currentWaterTempC: 6,
        ambientTempC: 30,
        volumeMl: 500,
        iceAmount: 'none',
        elapsedMinutes: THERMAL_FORECAST_HORIZON_MINUTES * 30,
      }).status,
    ).toBe('invalid_input');
  });
  test('supports the bounded four-hour graph horizon', () => {
    const input = {
      currentWaterTempC: 6,
      ambientTempC: 30,
      volumeMl: 500,
      iceAmount: 'none' as const,
      elapsedMinutes: 0,
    };
    const points = THERMAL_FORECAST_GRAPH_POINTS_MINUTES.map(minutes =>
      forecastTemperature(input, minutes),
    );

    expect(THERMAL_FORECAST_GRAPH_POINTS_MINUTES).toEqual([
      0,
      30,
      60,
      120,
      180,
      240,
    ]);
    expect(points.every(point => point.status === 'ready')).toBe(true);
    expect(
      forecastTemperature(input, THERMAL_FORECAST_GRAPH_HORIZON_MINUTES).status,
    ).toBe('ready');
    expect(
      forecastTemperature(input, THERMAL_FORECAST_GRAPH_HORIZON_MINUTES + 1).status,
    ).toBe('invalid_input');
  });
});
