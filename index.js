require('dotenv').config(); // Loads your secret vault
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const admin = require('firebase-admin');

const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('EMS Bot is awake and running 24/7!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Dummy web server running on port ${port}`));

// 1. Initialize Firebase using the secure Environment Variables
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // The replace() function fixes formatting issues with keys in the cloud
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
  })
});
const db = admin.firestore();

// 2. Initialize Discord Bot
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

client.once('ready', () => {
    console.log(`🤖 Logged in and monitoring database as ${client.user.tag}`);

    // 3. The Database Watchdog
    db.collection('applications').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async (change) => {
            
            // We only care when an application is MODIFIED
            if (change.type === 'modified') {
                const data = change.doc.data();

                // Only trigger if it was just decided AND hasn't been notified yet
                if ((data.status === 'Accepted' || data.status === 'Rejected') && !data.notified) {
                    
                    if (!data.discordId || data.discordId === "undefined" || String(data.discordId).trim() === "") {
                        console.error(`⚠️ Skipping DM for ${data.characterName} - No valid Discord ID on file.`);
                        // Mark it as notified so the bot doesn't get stuck in a loop trying to message them
                        await change.doc.ref.update({ notified: true });
                        return; 
                    }

                    try {
                        const cleanId = String(data.discordId).replace(/\D/g, '');
                        
                        // Fetch the user using the clean 18-digit ID
                        const user = await client.users.fetch(cleanId);

                        const embedColor = data.status === 'Accepted' ? 0x43a047 : 0xe53935;
                        
                        // text based on accept or reject
                        const nextSteps = data.status === 'Accepted' 
                            ? 'Please open an interview ticket in the Discord to schedule your interview with Command.' 
                            : 'Thank you for your interest in Seasons EMS. Unfortunately, we will not be moving forward at this time.';

                        const embed = new EmbedBuilder()
                            .setTitle(`📋 EMS Application ${data.status.toUpperCase()}`)
                            .setDescription(`Hello ${data.characterName},\n\nYour recent application to Seasons EMS has been **${data.status}**.\n\n${nextSteps}`)
                            .setColor(embedColor)
                            .setFooter({ text: 'Seasons Roleplay Command' })
                            .setTimestamp();

                        if (data.reason) {
                            embed.addFields({ name: 'Command Note:', value: data.reason });
                        }

                        // Fire the DM
                        await user.send({ embeds: [embed] });
                        console.log(`✅ Successfully sent DM to ${data.discordName} (${cleanId})`);

                        // Update Firebase so the bot knows this person was handled
                        await change.doc.ref.update({ notified: true });

                    } catch (error) {
                        console.error(`❌ Failed to DM ${data.discordName}. They likely have DMs turned off or the ID is wrong.`, error.message);
                        await change.doc.ref.update({ notified: true });
                    }
                }
            }
        });
    });

    // 4. The FTO Database Watchdog
    db.collection('fto_applications').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async (change) => {
            
            if (change.type === 'modified') {
                const data = change.doc.data();

                if ((data.status === 'Accepted' || data.status === 'Rejected') && !data.notified) {
                    
                    if (!data.discordId || data.discordId === "undefined" || String(data.discordId).trim() === "") {
                        await change.doc.ref.update({ notified: true });
                        return; 
                    }

                    try {
                        const cleanId = String(data.discordId).replace(/\D/g, '');
                        const user = await client.users.fetch(cleanId);

                        const embedColor = data.status === 'Accepted' ? 0x43a047 : 0xe53935;
                        
                        // Custom text based on accept or reject
                        const nextSteps = data.status === 'Accepted' 
                            ? 'Please open a support ticket in the Discord to continue the promotion process.' 
                            : 'Thank you for your interest and dedication to the department.';

                        const embed = new EmbedBuilder()
                            .setTitle(`⭐ FTO Application ${data.status.toUpperCase()}`)
                            .setDescription(`Hello ${data.medicName},\n\nYour recent application for Field Training Officer has been **${data.status}**.\n\n${nextSteps}`)
                            .setColor(embedColor)
                            .setFooter({ text: 'Seasons Roleplay Command' })
                            .setTimestamp();

                        if (data.reason) {
                            embed.addFields({ name: 'Command Note:', value: data.reason });
                        }

                        await user.send({ embeds: [embed] });
                        console.log(`✅ Successfully sent FTO DM to ${data.discordName} (${cleanId})`);

                        await change.doc.ref.update({ notified: true });

                    } catch (error) {
                        console.error(`❌ Failed to DM ${data.discordName}.`, error.message);
                        await change.doc.ref.update({ notified: true });
                    }
                }
            }
        });
    });

    
});

client.login(process.env.DISCORD_TOKEN);