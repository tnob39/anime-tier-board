import { Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { TonightWidgetProps } from '@/lib/widget-data';

const TonightWidget = (props: TonightWidgetProps, environment: WidgetEnvironment) => {
  'widget';

  const isSmall = environment.widgetFamily === 'systemSmall';
  const candidates = [props.candidate1, props.candidate2, props.candidate3].filter(Boolean);
  const visibleCandidates = isSmall ? candidates.slice(0, 1) : candidates.slice(0, 3);

  return (
    <VStack modifiers={[padding({ all: 12 })]}>
      <Text modifiers={[font({ weight: 'bold', size: isSmall ? 14 : 16 }), foregroundStyle('#6366f1')]}>
        {props.headline}
      </Text>
      {visibleCandidates.map((title, index) => (
        <VStack key={`${title}-${index}`}>
          <Text modifiers={[font({ weight: 'semibold', size: isSmall ? 13 : 14 }), foregroundStyle('#111827')]}>
            {`${index + 1}. ${title}`}
          </Text>
          {!isSmall ? (
            <Text modifiers={[font({ size: 11 }), foregroundStyle('#6b7280')]}>
              {[props.detail1, props.detail2, props.detail3][index] ?? ''}
            </Text>
          ) : null}
        </VStack>
      ))}
    </VStack>
  );
};

export default createWidget('TonightWidget', TonightWidget);