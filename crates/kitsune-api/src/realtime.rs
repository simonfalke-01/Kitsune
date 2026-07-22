//! Authenticated WebSocket transport with SSE fallback.

use std::{convert::Infallible, time::Duration};

use axum::{
    extract::{State, WebSocketUpgrade, ws::Message},
    response::{IntoResponse, Sse, sse::Event},
};
use axum_extra::extract::PrivateCookieJar;
use futures::{SinkExt, StreamExt};

use crate::{ApiResult, AppState, SessionIdentity};

/// Upgrades an authenticated realtime connection.
pub(crate) async fn websocket(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    upgrade: WebSocketUpgrade,
) -> ApiResult<impl IntoResponse> {
    let _identity = SessionIdentity::require(&state.auth_repository, &jar).await?;
    let bus = state.event_bus.clone();
    Ok(upgrade.on_upgrade(move |socket| async move {
        let Ok(mut events) = bus.subscribe(&[]).await else {
            return;
        };
        let (mut sender, mut receiver) = socket.split();
        loop {
            tokio::select! {
                event = events.next() => {
                    let Some(event) = event else {
                        break;
                    };
                    let Ok(serialized) = serde_json::to_string(&event) else {
                        continue;
                    };
                    if sender.send(Message::Text(serialized.into())).await.is_err() {
                        break;
                    }
                }
                message = receiver.next() => {
                    let connection_closed = matches!(
                        &message,
                        Some(Ok(Message::Close(_)) | Err(_)) | None
                    );
                    if connection_closed {
                        break;
                    }

                    if let Some(Ok(Message::Ping(payload))) = message
                        && sender.send(Message::Pong(payload)).await.is_err()
                    {
                        break;
                    }
                }
            }
        }
    }))
}

/// Authenticated server-sent event fallback with keepalives.
pub(crate) async fn sse(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
) -> ApiResult<impl IntoResponse> {
    let _identity = SessionIdentity::require(&state.auth_repository, &jar).await?;
    let events = state
        .event_bus
        .subscribe(&[])
        .await
        .map_err(crate::ApiError::from)?;
    let stream = events.map(|envelope| {
        let event = Event::default()
            .id(envelope.id.to_string())
            .event(envelope.kind())
            .json_data(envelope)
            .unwrap_or_else(|_| Event::default().event("serialization_error"));
        Ok::<_, Infallible>(event)
    });
    Ok(Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keepalive"),
    ))
}
