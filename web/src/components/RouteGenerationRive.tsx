import { Fit, Layout, useRive, useStateMachineInput } from '@rive-app/react-canvas';
import { useEffect, useState } from 'react';

const flowerBloom = new URL('../assets/route-generation-flower.riv', import.meta.url).href;
const stateMachine = 'State Machine 1';

type Props = {
  active: boolean;
};

/**
 * Rive 仅为「生成路线」提供即时反馈；请求状态始终由 React Query 的 mutation 管理。
 * 资源或状态机不可用时隐藏 canvas，让按钮文本承担完整的 loading 反馈。
 */
export function RouteGenerationRive({ active }: Props) {
  const [failed, setFailed] = useState(false);
  const { RiveComponent, rive } = useRive({
    src: flowerBloom,
    artboard: 'Flower split',
    stateMachines: stateMachine,
    autoplay: active,
    layout: new Layout({ fit: Fit.Contain }),
    onLoadError: () => setFailed(true),
  });
  const click = useStateMachineInput(rive, stateMachine, 'Click');

  useEffect(() => {
    if (!rive) return;
    if (active) {
      rive.play(stateMachine);
      if (click && 'fire' in click && typeof click.fire === 'function') click.fire();
      return;
    }
    rive.stop(stateMachine);
  }, [active, click, rive]);

  useEffect(() => () => rive?.stop(stateMachine), [rive]);

  if (failed || !active) return null;
  return <RiveComponent className="route-rive" aria-hidden="true" />;
}
