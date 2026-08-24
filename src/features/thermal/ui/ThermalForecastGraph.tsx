import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

export type ThermalGraphPoint = {
  minutes: number;
  projectedTemperatureC: number;
  lowTemperatureC: number;
  highTemperatureC: number;
};

type ThermalForecastGraphProps = {
  points: readonly ThermalGraphPoint[];
  ambientTempC: number;
};

const GRAPH_HEIGHT = 176;
const PLOT_TOP = 12;
const PLOT_BOTTOM = 28;
const PLOT_LEFT = 32;
const PLOT_RIGHT = 8;

function formatTime(minutes: number): string {
  if (minutes === 0) {
    return '現在';
  }
  if (minutes < 60) {
    return `${minutes}分`;
  }
  return `${minutes / 60}時間`;
}

function PlotSegment({
  from,
  to,
  color,
  thickness,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  thickness: number;
}) {
  const x1 = from.x;
  const y1 = from.y;
  const x2 = to.x;
  const y2 = to.y;
  const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.plotSegment,
        {
          backgroundColor: color,
          height: thickness,
          left: (x1 + x2 - length) / 2,
          top: (y1 + y2 - thickness) / 2,
          transform: [{ rotate: `${angle}deg` }],
          width: length,
        },
      ]}
    />
  );
}

export function ThermalForecastGraph({
  points,
  ambientTempC,
}: ThermalForecastGraphProps) {
  const [graphWidth, setGraphWidth] = useState(280);
  const plotWidth = Math.max(1, graphWidth - PLOT_LEFT - PLOT_RIGHT);
  const plotHeight = GRAPH_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const timeMax = points[points.length - 1]?.minutes ?? 240;
  const scale = useMemo(() => {
    const values = points.flatMap(point => [
      point.lowTemperatureC,
      point.highTemperatureC,
    ]);
    values.push(ambientTempC);
    const low = Math.floor(Math.min(...values) - 1);
    const high = Math.ceil(Math.max(...values) + 1);
    return { low, high: Math.max(low + 1, high) };
  }, [ambientTempC, points]);

  const xFor = (minutes: number) =>
    PLOT_LEFT + (minutes / Math.max(1, timeMax)) * plotWidth;
  const yFor = (temperature: number) =>
    PLOT_TOP +
    ((scale.high - temperature) / (scale.high - scale.low)) * plotHeight;
  const positions = points.map(point => ({
    point,
    x: xFor(point.minutes),
    y: yFor(point.projectedTemperatureC),
    lowY: yFor(point.lowTemperatureC),
    highY: yFor(point.highTemperatureC),
  }));
  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0 && Math.abs(nextWidth - graphWidth) > 1) {
      setGraphWidth(nextWidth);
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={styles.predictedLegendLine} />
          <Text style={styles.legendText}>予測</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.ambientLegendLine} />
          <Text style={styles.legendText}>周囲温度</Text>
        </View>
        <Text style={styles.legendHint}>帯 = 予測範囲</Text>
      </View>

      <View style={styles.chartRow}>
        <View style={styles.yAxisLabels} pointerEvents="none">
          <Text style={styles.axisLabel}>{scale.high}℃</Text>
          <Text style={styles.axisLabel}>{scale.low}℃</Text>
        </View>
        <View style={styles.plot} onLayout={onLayout}>
          <View
            pointerEvents="none"
            style={[styles.ambientLine, { top: yFor(ambientTempC) }]}
          />
          {Array.from({ length: 10 }, (_, index) => (
            <View
              key={`ambient-dash-${index}`}
              pointerEvents="none"
              style={[
                styles.ambientDash,
                {
                  left: PLOT_LEFT + (index / 10) * Math.max(1, plotWidth - 18),
                  top: yFor(ambientTempC) - 1,
                },
              ]}
            />
          ))}
          {positions.map(({ point, x, lowY, highY }, index) => (
            <React.Fragment key={`range-${point.minutes}`}>
              <View
                pointerEvents="none"
                style={[
                  styles.rangeStem,
                  {
                    height: Math.max(4, lowY - highY),
                    left: x - 5,
                    top: highY,
                  },
                ]}
              />
              {index > 0 ? (
                <>
                  <PlotSegment
                    from={{
                      x: positions[index - 1].x,
                      y: positions[index - 1].lowY,
                    }}
                    to={{ x, y: yFor(point.lowTemperatureC) }}
                    color="#b8e8eb"
                    thickness={2}
                  />
                  <PlotSegment
                    from={{
                      x: positions[index - 1].x,
                      y: positions[index - 1].highY,
                    }}
                    to={{ x, y: highY }}
                    color="#b8e8eb"
                    thickness={2}
                  />
                  <PlotSegment
                    from={{
                      x: positions[index - 1].x,
                      y: positions[index - 1].y,
                    }}
                    to={{ x, y: yFor(point.projectedTemperatureC) }}
                    color="#087ea4"
                    thickness={3}
                  />
                </>
              ) : null}
              <View
                pointerEvents="none"
                style={[
                  styles.point,
                  { left: x - 5, top: yFor(point.projectedTemperatureC) - 5 },
                ]}
              />
            </React.Fragment>
          ))}
          <View style={styles.gridLineTop} pointerEvents="none" />
          <View style={styles.gridLineBottom} pointerEvents="none" />
          <View style={styles.xAxisLabels} pointerEvents="none">
            {points.map(point => (
              <Text
                key={`label-${point.minutes}`}
                style={[styles.xAxisLabel, { left: xFor(point.minutes) - 19 }]}
              >
                {formatTime(point.minutes)}
              </Text>
            ))}
          </View>
        </View>
      </View>

      <Text style={styles.actualHint}>
        実測: 温度計測後に表示。現在は標準モデルによる予測です。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: 14 },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  predictedLegendLine: {
    backgroundColor: '#087ea4',
    borderRadius: 2,
    height: 3,
    width: 18,
  },
  ambientLegendLine: {
    borderTopColor: '#83b8be',
    borderTopWidth: 2,
    borderStyle: 'dashed',
    width: 18,
  },
  legendText: { color: '#587177', fontSize: 10, fontWeight: '700' },
  legendHint: { color: '#8b9ba0', flex: 1, fontSize: 10, textAlign: 'right' },
  chartRow: { flexDirection: 'row', height: GRAPH_HEIGHT },
  yAxisLabels: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: PLOT_BOTTOM - 2,
    paddingTop: PLOT_TOP - 2,
    width: PLOT_LEFT - 6,
  },
  axisLabel: { color: '#8b9ba0', fontSize: 10 },
  plot: {
    backgroundColor: '#f2fcfd',
    borderRadius: 12,
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  gridLineTop: {
    borderTopColor: '#dceff1',
    borderTopWidth: 1,
    left: 0,
    position: 'absolute',
    right: 0,
    top: PLOT_TOP,
  },
  gridLineBottom: {
    borderTopColor: '#dceff1',
    borderTopWidth: 1,
    bottom: PLOT_BOTTOM,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  ambientLine: {
    borderTopColor: '#83b8be',
    borderTopWidth: 1,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  ambientDash: {
    backgroundColor: '#83b8be',
    height: 2,
    position: 'absolute',
    width: 7,
  },
  rangeStem: {
    backgroundColor: '#b8e8eb',
    borderRadius: 6,
    position: 'absolute',
    width: 10,
  },
  plotSegment: { borderRadius: 3, position: 'absolute' },
  point: {
    backgroundColor: '#087ea4',
    borderColor: '#e5fbfc',
    borderRadius: 5,
    borderWidth: 2,
    height: 10,
    position: 'absolute',
    width: 10,
  },
  xAxisLabels: {
    bottom: 5,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  xAxisLabel: {
    color: '#73878c',
    fontSize: 9,
    position: 'absolute',
    textAlign: 'center',
    width: 38,
  },
  actualHint: { color: '#8b9ba0', fontSize: 10, lineHeight: 15, marginTop: 8 },
});
