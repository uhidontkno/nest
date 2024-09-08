const utils = require("../utils")
const os = require("node:os")
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const validator = require('validator');

module.exports = function ({ program, run }) {
    const caddy = program.command("caddy")
    var username = os.userInfo().username
    caddy
        .command('list')
        .description('lists all domains you have configured in caddy')
        .option('--user', 'allows you to add a domain on behalf of a user (requires sudo)')
        .action(async (options) => {
            if (options?.user) username = options.user
            var domains = await utils.getDomains(username)
            domains = domains.map(domain => `- ${domain.domain} (${domain.proxy})`).join("\n")
            console.log(domains)
        });
    caddy
        .command('add <domain>')
        .description('adds a domain to caddy')
        .option('--proxy', 'changes where the domain should be proxied to (advanced)')
        .option('--user', 'allows you to add a domain on behalf of a user (requires sudo)')
        .action(async (domain, options) => {
            if (options?.user) username = options.user
            if (!validator.isFQDN(domain)) {
                console.error("This domain is not a valid domain name. Please choose a valid domain name.")
                process.exit(1)
            }
            if (await utils.domainExists(domain)) {
                console.error("This domain already has already been taken by you or someone else. Pick another one!")
                process.exit(1)
            }
            if (utils.checkWhitelist(domain, username)) {
                await prisma.domain.create({
                    data: {
                        domain, username, proxy: options?.proxy || `unix//home/${username}/.${domain}.webserver.sock`
                    }
                })
                await utils.reloadCaddy()
                return console.log(`${domain} added. (${options?.proxy || `unix//home/${username}/.${domain}.webserver.sock`})`)

            }
            // Proceed as a regular domain
            if (!await utils.checkVerification(domain, username)) {
                console.error(`Please set the TXT record for domain-verification to your username (${username}). You can remove it after it is added.`)
                process.exit(1)
            }
            await prisma.domain.create({
                data: {
                    domain, username, proxy: options?.proxy || `unix//home/${username}/.${domain}.webserver.sock`
                }
            })
            await utils.reloadCaddy()
            return console.log(`${domain} added. (${options?.proxy || `unix//home/${username}/.${domain}.webserver.sock`})`)
        });
    caddy
        .command('rm <domain>')
        .description('removes a domain from caddy')
        .option('--user', 'allows you to add a domain on behalf of a user (requires sudo)')
        .action(async (domain, options) => {
            if (options?.user) username = options.user
            if (!validator.isFQDN(domain)) {
                console.error("This domain is not a valid domain name. Please choose a valid domain name.")
                process.exit(1)
            }
            if (!await utils.domainExists(domain)) {
                console.error("This domain is not in Caddy.")
                process.exit(1)
            }
            if (!await utils.domainOwnership(domain, username)) {
                console.error("You do not own the domain, so you cannot remove it.")
                process.exit(1)
            }
            await prisma.domain.delete({
                where: {
                    domain, username
                }
            })
            await utils.reloadCaddy()
            console.log(`${domain} removed.`)
        });
}