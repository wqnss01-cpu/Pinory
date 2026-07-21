import { markerCatalog } from '@pinory/config';
import { pool,tx } from '../db.js';

await tx(async(client)=>{
  for(let i=0;i<markerCatalog.length;i++){
    const [code,name,icon]=markerCatalog[i]!;
    const category=await client.query(`INSERT INTO place_categories(code,name,icon,sort_order) VALUES($1,$2,$3,$4)
      ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,icon=EXCLUDED.icon,sort_order=EXCLUDED.sort_order RETURNING id`,[code,name,icon,i]);
    await client.query(`INSERT INTO marker_icons(code,name,category_id,asset_url,sort_order) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,category_id=EXCLUDED.category_id,asset_url=EXCLUDED.asset_url,sort_order=EXCLUDED.sort_order`,[code,name,category.rows[0].id,icon,i]);
  }
  await client.query(`INSERT INTO marker_icons(code,name,asset_url,sort_order) VALUES('pin','Классическая метка','pin',999)
    ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,asset_url=EXCLUDED.asset_url`);
});
console.log('✓ Pinory: справочники категорий и меток готовы; демо-контент не создавался');await pool.end();
