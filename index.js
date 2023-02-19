const { Client } = require("@notionhq/client")
const dotenv = require("dotenv")
const _ = require("lodash")

dotenv.config()
const notion = new Client({ auth: process.env.NOTION_KEY })

const databaseId = process.env.NOTION_DATABASE_ID
const OPERATION_BATCH_SIZE = 10

let hltb = require('howlongtobeat');
let hltbService = new hltb.HowLongToBeatService();

performSync()

async function getGamesFromNotionDatabase() {
    const pages = []
    let cursor = undefined
    while (true) {
      const { results, next_cursor } = await notion.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
        filter: {
            or: [
            {
                property: "Status",
                select: {
                    equals: "Backlog"
                }
            }, 
            {
                property: "Status",
                select: {
                    equals: "Wishlist"
                }
            }]
        }
      })
      pages.push(...results)
      if (!next_cursor) {
        break
      }
      cursor = next_cursor
    }
    console.log(`${pages.length} games successfully fetched.`)
    
    const games = []

    for (const page of pages) {
        let title = page.properties["Projects"].title[0].plain_text
        await hltbService.search(title).then(results => {
            let bestResult = _.orderBy(results, 'similarity', 'desc')[0]
            games.push({
                pageId: page.id,
                hltbText: `Main Story: ${bestResult.gameplayMain}\nMain + Extras: ${bestResult.gameplayMainExtra}\nCompletionist: ${bestResult.gameplayCompletionist}` 
            })
        }).catch(e => console.error(e));
    }
    return games
  }

  async function updatePages(pagesToUpdate) {
    console.log(`number of pages to update=${pagesToUpdate.length}`)
    const pagesToUpdateChunks = _.chunk(pagesToUpdate, OPERATION_BATCH_SIZE)
    for (const pagesToUpdateBatch of pagesToUpdateChunks) {
      await Promise.all(
        pagesToUpdateBatch.map(({ pageId, hltbText }) => {
            notion.pages.update({
                page_id: pageId,
                properties: buildRichTextProperty(hltbText)
            })
        })
      )
      console.log(`Completed batch size: ${pagesToUpdateBatch.length}`)
    }
  }

  async function performSync() {
    console.log(`get games`)
    const games = await getGamesFromNotionDatabase()
    console.log(`update pages`)
    await updatePages(games)
  }

  function buildRichTextProperty(text) {
    return {
        "How Long To Beat": {
            "type": "rich_text",
            "rich_text": [
                {
                    "type": "text",
                    "text": {
                        "content": text,
                        "link": null
                    }
                }
            ]
        }
    }
  }
  