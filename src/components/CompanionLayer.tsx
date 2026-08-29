// Выбранный персонаж как фоновый слой Today.
//
// Слой лежит рядом с .app, а не внутри: у .app свой z-index, а он изолирует
// смешивание — mix-blend-mode изнутри не достал бы до звёздного неба, и
// чёрный фон ролика остался бы чёрным прямоугольником.
import { useMemo } from 'react';
import { useAppStore, useStoreVersion } from '../AppContext';
import { CHARACTERS, clipUrls, isCharacterUnlocked } from '../data/characters';
import { IdleVideo } from './CharacterMedia';

export function CompanionLayer() {
  const store = useAppStore();
  const version = useStoreVersion();

  const companion = useMemo(() => {
    const c = CHARACTERS.find((x) => x.id === store.meta.equipped_character);
    if (!c) return null;
    const p = { learned: store.learnedCount(), completedLevels: store.completedLevels() };
    return isCharacterUnlocked(c, p) ? c : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);

  if (!companion) return null;

  return (
    <div className="companion-layer" aria-hidden="true">
      <IdleVideo sources={clipUrls(companion)} className="companion-layer__video" standalone />
    </div>
  );
}
