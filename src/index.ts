import 'dotenv/config';
import { youtube_v3 } from 'googleapis';
import { getYoutubeClient } from './youtube.js';

const HOURS_WINDOW = 24;
const CHANNEL_BATCH_SIZE = 50;
const SHORTS_MAX_DURATION_SECONDS = 180;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

type RecentVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
};

async function getSubscribedChannelIds(youtube: youtube_v3.Youtube): Promise<string[]> {
  const channelIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await youtube.subscriptions.list({
      mine: true,
      part: ['snippet'],
      maxResults: 50,
      pageToken,
    });

    for (const item of res.data.items ?? []) {
      const channelId = item.snippet?.resourceId?.channelId;
      if (channelId) channelIds.push(channelId);
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return channelIds;
}

async function getUploadsPlaylistIds(youtube: youtube_v3.Youtube, channelIds: string[]): Promise<string[]> {
  const uploadsPlaylistIds: string[] = [];

  for (let i = 0; i < channelIds.length; i += CHANNEL_BATCH_SIZE) {
    const batch = channelIds.slice(i, i + CHANNEL_BATCH_SIZE);

    const res = await youtube.channels.list({
      id: batch,
      part: ['contentDetails'],
      maxResults: CHANNEL_BATCH_SIZE,
    });

    for (const channel of res.data.items ?? []) {
      const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
      if (uploadsId) uploadsPlaylistIds.push(uploadsId);
    }
  }

  return uploadsPlaylistIds;
}

async function getRecentVideosFromPlaylist(
  youtube: youtube_v3.Youtube,
  uploadsPlaylistId: string,
  cutoff: Date
): Promise<RecentVideo[]> {
  const recentVideos: RecentVideo[] = [];
  let pageToken: string | undefined;

  do {
    const res = await youtube.playlistItems.list({
      playlistId: uploadsPlaylistId,
      part: ['contentDetails', 'snippet'],
      maxResults: 50,
      pageToken,
    });

    const items = res.data.items ?? [];
    let reachedOlderVideo = false;

    for (const item of items) {
      const videoId = item.contentDetails?.videoId;
      const publishedAt = item.contentDetails?.videoPublishedAt;
      if (!videoId || !publishedAt) continue;

      if (new Date(publishedAt) < cutoff) {
        reachedOlderVideo = true;
        break;
      }

      recentVideos.push({
        videoId,
        title: item.snippet?.title ?? '(sem título)',
        channelTitle: item.snippet?.videoOwnerChannelTitle ?? item.snippet?.channelTitle ?? '',
        publishedAt,
      });
    }

    if (reachedOlderVideo) break;

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return recentVideos;
}

async function getExistingPlaylistVideoIds(youtube: youtube_v3.Youtube, playlistId: string): Promise<Set<string>> {
  const videoIds = new Set<string>();
  let pageToken: string | undefined;

  do {
    const res = await youtube.playlistItems.list({
      playlistId,
      part: ['contentDetails'],
      maxResults: 50,
      pageToken,
    });

    for (const item of res.data.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      if (videoId) videoIds.add(videoId);
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return videoIds;
}

function parseIsoDurationToSeconds(duration: string): number {
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return Infinity;
  const [, hours, minutes, seconds] = match;
  return Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}

async function filterOutShorts(youtube: youtube_v3.Youtube, videos: RecentVideo[]): Promise<RecentVideo[]> {
  const durationSecondsByVideoId = new Map<string, number>();

  for (let i = 0; i < videos.length; i += CHANNEL_BATCH_SIZE) {
    const batch = videos.slice(i, i + CHANNEL_BATCH_SIZE);

    const res = await youtube.videos.list({
      id: batch.map((video) => video.videoId),
      part: ['contentDetails'],
      maxResults: CHANNEL_BATCH_SIZE,
    });

    for (const item of res.data.items ?? []) {
      if (item.id && item.contentDetails?.duration) {
        durationSecondsByVideoId.set(item.id, parseIsoDurationToSeconds(item.contentDetails.duration));
      }
    }
  }

  return videos.filter((video) => {
    const durationSeconds = durationSecondsByVideoId.get(video.videoId) ?? Infinity;
    return durationSeconds > SHORTS_MAX_DURATION_SECONDS;
  });
}

async function addVideoToPlaylist(youtube: youtube_v3.Youtube, playlistId: string, videoId: string): Promise<void> {
  await youtube.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: {
          kind: 'youtube#video',
          videoId,
        },
      },
    },
  });
}

async function main() {
  const targetPlaylistId = requireEnv('TARGET_PLAYLIST_ID');
  const youtube = getYoutubeClient();
  const cutoff = new Date(Date.now() - HOURS_WINDOW * 60 * 60 * 1000);

  console.log(`Buscando canais inscritos...`);
  const channelIds = await getSubscribedChannelIds(youtube);
  console.log(`${channelIds.length} canais inscritos encontrados.`);

  const uploadsPlaylistIds = await getUploadsPlaylistIds(youtube, channelIds);

  console.log(`Verificando uploads das últimas ${HOURS_WINDOW}h...`);
  const recentVideosPerChannel = await Promise.all(
    uploadsPlaylistIds.map(async (playlistId) => {
      try {
        return await getRecentVideosFromPlaylist(youtube, playlistId, cutoff);
      } catch (err) {
        console.warn(`Aviso: não foi possível ler a playlist de uploads ${playlistId}, pulando. Motivo: ${(err as Error).message}`);
        return [];
      }
    })
  );
  const recentVideos = recentVideosPerChannel.flat();
  console.log(`${recentVideos.length} vídeos publicados nas últimas ${HOURS_WINDOW}h.`);

  console.log(`Filtrando shorts (vídeos com até ${SHORTS_MAX_DURATION_SECONDS}s)...`);
  const recentVideosWithoutShorts = await filterOutShorts(youtube, recentVideos);
  console.log(`${recentVideos.length - recentVideosWithoutShorts.length} shorts descartados.`);

  console.log(`Carregando itens já presentes na playlist de destino...`);
  const existingVideoIds = await getExistingPlaylistVideoIds(youtube, targetPlaylistId);

  const videosToAdd = recentVideosWithoutShorts.filter((video) => !existingVideoIds.has(video.videoId));
  console.log(`${videosToAdd.length} vídeos novos para adicionar.`);

  for (const video of videosToAdd) {
    try {
      await addVideoToPlaylist(youtube, targetPlaylistId, video.videoId);
      console.log(`Adicionado: [${video.channelTitle}] ${video.title}`);
    } catch (err) {
      console.warn(`Aviso: não foi possível adicionar "${video.title}" (${video.videoId}), pulando. Motivo: ${(err as Error).message}`);
    }
  }

  console.log('Concluído.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
