import { NextResponse } from 'next/server';

/**
 * 健康檢查端點 - 用於檢測後端術語庫 API 是否可用
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'glossary-api',
    timestamp: new Date().toISOString()
  });
}
