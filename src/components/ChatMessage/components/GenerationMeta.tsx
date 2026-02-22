import React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Message } from '../../../types';

interface GenerationMetaProps {
  generationMeta: NonNullable<Message['generationMeta']>;
  styles: any;
}

type MetaItem = { key: string; label: string; maxLines?: number };

function buildMetaItems(
  generationMeta: NonNullable<Message['generationMeta']>,
  tps: number | null | undefined,
): MetaItem[] {
  const items: MetaItem[] = [];
  const layers = generationMeta.gpuLayers != null && generationMeta.gpuLayers > 0
    ? ` (${generationMeta.gpuLayers}L)` : '';
  items.push({ key: 'backend', label: `${generationMeta.gpuBackend || (generationMeta.gpu ? 'GPU' : 'CPU')}${layers}` });
  if (generationMeta.modelName) {
    items.push({ key: 'model', label: generationMeta.modelName, maxLines: 1 });
  }
  if (tps != null && tps > 0) {
    items.push({ key: 'tps', label: `${tps.toFixed(1)} tok/s` });
  }
  if (generationMeta.timeToFirstToken != null && generationMeta.timeToFirstToken > 0) {
    items.push({ key: 'ttft', label: `TTFT ${generationMeta.timeToFirstToken.toFixed(1)}s` });
  }
  if (generationMeta.tokenCount != null && generationMeta.tokenCount > 0) {
    items.push({ key: 'tokens', label: `${generationMeta.tokenCount} tokens` });
  }
  if (generationMeta.steps != null) {
    items.push({ key: 'steps', label: `${generationMeta.steps} steps` });
  }
  if (generationMeta.guidanceScale != null) {
    items.push({ key: 'cfg', label: `cfg ${generationMeta.guidanceScale}` });
  }
  if (generationMeta.resolution) {
    items.push({ key: 'res', label: generationMeta.resolution });
  }
  return items;
}

export function GenerationMeta({ generationMeta, styles }: GenerationMetaProps) {
  const tps = generationMeta.decodeTokensPerSecond ?? generationMeta.tokensPerSecond;
  const items = buildMetaItems(generationMeta, tps);

  return (
    <Animated.View entering={FadeIn.duration(250)}>
      <View testID="generation-meta" style={styles.generationMetaRow}>
        {items.map((item, index) => (
          <React.Fragment key={item.key}>
            {index > 0 && <Text style={styles.generationMetaSep}>·</Text>}
            <Text style={styles.generationMetaText} numberOfLines={item.maxLines}>
              {item.label}
            </Text>
          </React.Fragment>
        ))}
      </View>
    </Animated.View>
  );
}
