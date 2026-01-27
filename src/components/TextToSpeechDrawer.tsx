import React from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  Tooltip,
} from "@mui/material";
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Speed as SpeedIcon,
} from "@mui/icons-material";
import { TTSState, TTSControls } from "~/hooks/useTextToSpeech";

interface TextToSpeechDrawerProps {
  open: boolean;
  onClose: () => void;
  ttsState: TTSState;
  ttsControls: TTSControls;
}

export default function TextToSpeechDrawer({
  open,
  onClose,
  ttsState,
  ttsControls,
}: TextToSpeechDrawerProps) {
  const { isPlaying, isPaused, rate, voice, availableVoices, isSupported } = ttsState;
  const { play, pause, resume, stop, setRate, setVoice } = ttsControls;

  const handlePlayPause = () => {
    if (isPlaying && !isPaused) {
      pause();
    } else if (isPaused) {
      resume();
    } else {
      play();
    }
  };

  const handleStop = () => {
    stop();
  };

  const handleRateChange = (_event: Event, newValue: number | number[]) => {
    const newRate = newValue as number;
    setRate(newRate);
    // If currently playing, restart with new rate
    if (isPlaying) {
      stop();
      setTimeout(() => play(), 50);
    }
  };

  const handleVoiceChange = (event: { target: { value: string } }) => {
    const selectedVoice = availableVoices.find((v) => v.name === event.target.value);
    if (selectedVoice) {
      setVoice(selectedVoice);
      // If currently playing, restart with new voice
      if (isPlaying) {
        stop();
        setTimeout(() => play(), 50);
      }
    }
  };

  if (!isSupported) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "50vh",
          },
        }}
      >
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="h6" color="error">
            Text-to-speech is not supported in this browser
          </Typography>
        </Box>
      </Drawer>
    );
  }

  // Speed marks for the slider
  const speedMarks = [
    { value: 0.5, label: "0.5x" },
    { value: 1, label: "1x" },
    { value: 1.5, label: "1.5x" },
    { value: 2, label: "2x" },
  ];

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: "50vh",
        },
      }}
    >
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 3, textAlign: "center" }}>
          Text to Speech
        </Typography>

        <Stack spacing={3}>
          {/* Playback Controls */}
          <Box sx={{ display: "flex", justifyContent: "center", gap: 2 }}>
            <Tooltip title={isPlaying && !isPaused ? "Pause" : isPaused ? "Resume" : "Play"}>
              <IconButton
                onClick={handlePlayPause}
                sx={{
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "&:hover": { bgcolor: "primary.dark" },
                  width: 56,
                  height: 56,
                }}
              >
                {isPlaying && !isPaused ? (
                  <PauseIcon sx={{ fontSize: 32 }} />
                ) : (
                  <PlayIcon sx={{ fontSize: 32 }} />
                )}
              </IconButton>
            </Tooltip>

            <Tooltip title="Stop">
              <IconButton
                onClick={handleStop}
                disabled={!isPlaying && !isPaused}
                sx={{
                  bgcolor: "grey.300",
                  color: "grey.700",
                  "&:hover": { bgcolor: "grey.400" },
                  "&:disabled": { bgcolor: "grey.200", color: "grey.400" },
                  width: 56,
                  height: 56,
                }}
              >
                <StopIcon sx={{ fontSize: 32 }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Speed Control */}
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
              <SpeedIcon sx={{ mr: 1, color: "text.secondary" }} />
              <Typography variant="body2" color="text.secondary">
                Speed: {rate}x
              </Typography>
            </Box>
            <Slider
              value={rate}
              onChange={handleRateChange}
              min={0.5}
              max={2}
              step={0.1}
              marks={speedMarks}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value}x`}
            />
          </Box>

          {/* Voice Selection */}
          <FormControl fullWidth>
            <InputLabel id="voice-select-label">Voice</InputLabel>
            <Select
              labelId="voice-select-label"
              value={voice?.name || ""}
              label="Voice"
              onChange={handleVoiceChange}
            >
              {availableVoices.map((v) => (
                <MenuItem key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Status indicator */}
          {isPlaying && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textAlign: "center" }}
            >
              {isPaused ? "Paused" : "Reading..."}
            </Typography>
          )}
        </Stack>
      </Box>
    </Drawer>
  );
}
