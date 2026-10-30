
export async function L2J(sock, chatId, input) {
    try {
        
        const metadata = await sock.groupMetadata(chatId);

        
        const member = metadata.participants.find(p =>
            p.id === input ||                 
            p.id?.includes(input) ||        
            p.id?.split("@")[0] === input     
        );

        if (!member) return null;


        return member.jid || member.id || null;

    } catch (err) {
        console.error("❌ خطأ في L2J.js:", err);
        return null;
    }
}