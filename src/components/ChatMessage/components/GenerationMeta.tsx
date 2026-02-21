import React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Message } from '../../../types';

interface GenerationMetaProps {
  generationMeta: NonNullable<Message['generationMeta']>;
  styles: any;
}

export function GenerationMeta({ generationMeta, styles }: GenerationMetaProps) {
  const tps = generationMeta.decodeTokensPerSecond ?? generationMeta.tokensPerSecond;

  return (
    <Animated.View entering={FadeIn.duration(250)}>
      <View testID="generation-meta" style={styles.generationMetaRow}>
        <Text style={styles.generationMetaText}>
          {generationMeta.gpuBackend || (generationMeta.gpu ? 'GPU' : 'CPU')}
          {generationMeta.gpuLayers != null && generationMeta.gpuLayers > 0
            ? ` (${generationMeta.gpuLayers}L)`
            : ''}
        </Text>
        {generationMeta.modelName && (
          <>
            <Text style={styles.generationMetaSep}>·</Text>
            <Text style={styles.generationMetaText} numberOfLines={1}>
              {generationMeta.modelName}
            </Text>
          </>
        )}
        {tps != null && tps > 0 && (
          <>
            <Text style={styles.generationMetaSep}>·</Text>
            <Text style={styles.generationMetaText}>
              {tps.toFixed(1)} tok/s
            </Text>
          </>
        )}
        {generationMeta.timeToFirstToken != null && generationMeta.timeToFirstToken > 0 && (
          <>
            <Text style={styles.generationMetaSep}>·</Text>
            <Text style={styles.generationMetaText}>
              TTFT {generationMeta.timeToFirstToken.toFixed(1)}s
            </Text>
          </>
        )}
        {generationMeta.tokenCount != null && generationMeta.tokenCount > 0 && (
          <>
            <Text style={styles.generationMetaSep}>·</Text>
            <Text style={styles.generationMetaText}>
              {generationMeta.tokenCount} tokens
            </Text>
          </>
        )}
        {generationMeta.steps != null && (
          <>
            <Text style={styles.generationMetaSep}>·</Text>
            <Text style={styles.generationMetaText}>
              {generationMeta.steps} steps
            </Text>
          </>
        )}
        {generationMeta.guidanceScale != null && (
          <>
            <Text style={styles.generationMetaSep}>·</Text>
            <Text style={styles.generationMetaText}>
              cfg {generationMeta.guidanceScale}
            </Text>
          </>
        )}
        {generationMeta.resolution && (
          <>
            <Text style={styles.generationMetaSep}>·</Text>
            <Text style={styles.generationMetaText}>
              {generationMeta.resolution}
            </Text>
          </>
        )}
      </View>
    </Animated.View>
  );
}
