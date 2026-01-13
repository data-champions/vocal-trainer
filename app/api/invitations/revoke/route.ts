import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Invite revoke disabled' },
    { status: 410 }
  );
}
