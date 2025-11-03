let counter = 0;
export function nanoid(): string {
  return `msg_${Date.now()}_${counter++}`;
}

