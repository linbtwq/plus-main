import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRouletteTitles } from '../assets/js/roulette-merge.js';
test('Перенос планов сохраняет список и пропускает названия с другим регистром и пробелами',()=>{
    const result=mergeRouletteTitles('Сталкер\nМатрица',[' сталкер ','МАТРИЦА','Мой сосед Тоторо','Мой  сосед Тоторо']);
    assert.equal(result.text,'Сталкер\nМатрица\nМой сосед Тоторо');assert.equal(result.added,1);assert.equal(result.skipped,3);
});
test('Перенос не добавляет пустые строки и отклоняет превышение размера без обрезания',()=>{
    assert.deepEqual(mergeRouletteTitles('', ['','  ','Два\nслова']),{text:'Два слова',added:1,skipped:0});
    assert.throws(()=>mergeRouletteTitles('А'.repeat(100000),['Б']),/слишком длинный/);
});
