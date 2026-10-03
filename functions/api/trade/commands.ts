// No raw commands: entries require a server-stored proposal and explicit confirmation.
export async function onRequestPost() {
  return Response.json(
    { error: 'Envio direto bloqueado. Use CONFIRMAR OPERAÇÃO na proposta.' },
    { status: 409 },
  );
}
