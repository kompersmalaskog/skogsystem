// Testhjälp för page.historik.render.test.tsx: en stump i stället för en tung maskinvy. Visar sitt namn och vilken maskin den fick,
// med en knapp som byter maskin på samma sätt som vyernas maskinväljare (onMaskinChange).
export function stump(namn: string, maskinLista?: Array<{ id: string; namn: string }>) {
  return function Stump({ maskin, onMaskinChange }: any) {
    return (
      <div data-vy={namn} data-maskin={maskin?.id}>
        {namn}
        {maskinLista && onMaskinChange && (
          <button data-byt={namn} onClick={() => onMaskinChange(maskinLista[1])}>byt</button>
        )}
      </div>
    )
  }
}
export const SK = [{ id: 'R64101', namn: 'H8E -23' }, { id: 'R64428', namn: 'H8E -26' }]
export const SKO = [{ id: 'A110148', namn: 'Elefant 26' }, { id: 'A030353', namn: 'Wisent' }]
