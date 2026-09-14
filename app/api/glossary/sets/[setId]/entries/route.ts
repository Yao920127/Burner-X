import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

/**
 * 術語庫資料儲存路徑
 */
const GLOSSARY_DATA_DIR = path.join(process.cwd(), 'data', 'glossary');

/**
 * 載入指定術語庫的條目
 */
async function loadEntriesForSet(setId: string) {
  const filePath = path.join(GLOSSARY_DATA_DIR, `set_${setId}.json`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return data.entries || [];
  } catch (err) {
    console.error('Failed to load entries for set:', err);
    return [];
  }
}

/**
 * GET /api/glossary/sets/[setId]/entries - 獲取指定術語庫的條目
 */
export async function GET(
  request: Request,
  { params }: { params: { setId: string } }
) {
  try {
    const { setId } = params;
    const entries = await loadEntriesForSet(setId);

    return NextResponse.json({
      success: true,
      entries
    });
  } catch (err: any) {
    console.error('Failed to load entries:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to load entries'
      },
      { status: 500 }
    );
  }
}
