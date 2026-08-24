import React, { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { IceAmountClass } from '../../scan/domain/iceAmount';
import { forecastTemperature } from '../domain/thermalForecast';

type ThermalForecastCardProps = {
  capacityMl: number;
  iceAmount: IceAmountClass | null;
  currentWaterTempText: string;
  ambientTempText: string;
  elapsedMinutesText: string;
  onChangeCurrentWaterTemp(value: string): void;
  onChangeAmbientTemp(value: string): void;
  onChangeElapsedMinutes(value: string): void;
};

function parseNumber(value: string): number | undefined {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}分`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}時間` : `${hours}時間${rest}分`;
}

export function ThermalForecastCard({
  capacityMl,
  iceAmount,
  currentWaterTempText,
  ambientTempText,
  elapsedMinutesText,
  onChangeCurrentWaterTemp,
  onChangeAmbientTemp,
  onChangeElapsedMinutes,
}: ThermalForecastCardProps) {
  const forecast = useMemo(
    () =>
      forecastTemperature({
        currentWaterTempC: parseNumber(currentWaterTempText),
        ambientTempC: parseNumber(ambientTempText),
        volumeMl: capacityMl,
        iceAmount,
        elapsedMinutes: parseNumber(elapsedMinutesText),
      }),
    [
      ambientTempText,
      capacityMl,
      currentWaterTempText,
      elapsedMinutesText,
      iceAmount,
    ],
  );

  const range = forecast.temperatureRangeC;
  const hold = forecast.iceHoldMinutesRange;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>冷却の目安</Text>
          <Text style={styles.subtitle}>
            外気温と現在の水温から60分後を参考計算
          </Text>
        </View>
        <Text style={styles.horizon}>60分後</Text>
      </View>

      <View style={styles.inputRow}>
        <View style={styles.inputColumn}>
          <Text style={styles.inputLabel}>現在の水温</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={currentWaterTempText}
              onChangeText={onChangeCurrentWaterTemp}
              placeholder="例: 6"
              placeholderTextColor="#9aa9ad"
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="現在の水温"
            />
            <Text style={styles.unit}>℃</Text>
          </View>
        </View>
        <View style={styles.inputColumn}>
          <Text style={styles.inputLabel}>周囲温度</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={ambientTempText}
              onChangeText={onChangeAmbientTemp}
              placeholder="例: 30"
              placeholderTextColor="#9aa9ad"
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="周囲温度"
            />
            <Text style={styles.unit}>℃</Text>
          </View>
        </View>
        <View style={styles.inputColumnSmall}>
          <Text style={styles.inputLabel}>経過</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={elapsedMinutesText}
              onChangeText={onChangeElapsedMinutes}
              placeholder="0"
              placeholderTextColor="#9aa9ad"
              keyboardType="number-pad"
              accessibilityLabel="水温を測ってからの経過時間"
            />
            <Text style={styles.unit}>分</Text>
          </View>
        </View>
      </View>

      {forecast.status === 'ready' && range ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>60分後の水温（参考）</Text>
          <Text style={styles.resultValue}>
            約{forecast.projectedTemperatureC}℃
          </Text>
          <Text style={styles.resultRange}>
            予測範囲 {range.low}〜{range.high}℃
          </Text>
          {hold && hold.high > 0 ? (
            <Text style={styles.resultSubtext}>
              氷の冷却効果の目安 {formatMinutes(hold.low)}〜
              {formatMinutes(hold.high)}
            </Text>
          ) : (
            <Text style={styles.resultSubtext}>
              氷量未判定・氷なしを基準に計算
            </Text>
          )}
          <Text style={styles.assumption}>{forecast.message}</Text>
        </View>
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>
            水温と周囲温度を入力してください
          </Text>
          <Text style={styles.emptyText}>
            スマホのマイクは水温を測れないため、測定値がない間は予測を表示しません。
          </Text>
        </View>
      )}

      <Text style={styles.note}>
        水筒ごとの断熱性能や日射を含まない標準モデルです。医療判断や正確な保冷時間には使いません。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    marginTop: 20,
    padding: 20,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dce7e9',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  headerCopy: { flex: 1 },
  title: { color: '#17323b', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#73878c', fontSize: 12, lineHeight: 18, marginTop: 5 },
  horizon: {
    color: '#087ea4',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  inputColumn: { flex: 1 },
  inputColumnSmall: { width: 78 },
  inputLabel: {
    color: '#36515a',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  inputWrapper: { position: 'relative' },
  input: {
    color: '#17323b',
    backgroundColor: '#f8fbfb',
    borderColor: '#d4e1e3',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    paddingRight: 25,
    fontSize: 14,
  },
  unit: {
    position: 'absolute',
    right: 8,
    top: 12,
    color: '#73878c',
    fontSize: 10,
  },
  resultBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#edf8f8',
  },
  resultLabel: { color: '#36515a', fontSize: 12, fontWeight: '700' },
  resultValue: { color: '#087ea4', fontSize: 28, fontWeight: '800', marginTop: 6 },
  resultRange: { color: '#587177', fontSize: 12, marginTop: 3 },
  resultSubtext: { color: '#36515a', fontSize: 12, lineHeight: 18, marginTop: 8 },
  assumption: { color: '#73878c', fontSize: 11, lineHeight: 16, marginTop: 6 },
  emptyBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f6f9f9',
  },
  emptyTitle: { color: '#36515a', fontSize: 12, fontWeight: '700' },
  emptyText: { color: '#73878c', fontSize: 11, lineHeight: 17, marginTop: 5 },
  note: { color: '#8b9ba0', fontSize: 11, lineHeight: 17, marginTop: 14 },
});
